const { prisma } = require("../config/supabase");
const { 
    suggestTaskDetails, 
    suggestTaskUpdate, 
    suggestTaskPrioritization,
    suggestSubtasks,
    analyzeWorkload
} = require("../services/aiService");

// ✅ Create a new task (Personal) with AI suggestions for details and prioritization
exports.createTask = async (req, res) => {
    try {
        const { title, description, dueDate, priority, tags } = req.body;
        const userEmail = req.user.email; // Extract user email from token

        if (!title || !dueDate) {
            return res.status(400).json({ error: "Title and Due Date are required" });
        }

        // ✅ Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // AI Suggestion for task details
        const aiSuggestion = await suggestTaskDetails({ title, description, dueDate });

        // Insert task into the database
        const newTask = await prisma.task.create({
            data: {
                title,
                description: description || '',
                suggestedDescription: aiSuggestion.description,
                dueDate: new Date(dueDate),
                priority: priority || "MEDIUM",
                suggestedPriority: aiSuggestion.priority,
                userId: user.id,
                tags: {
                    connectOrCreate: tags?.map(tag => ({
                        where: { name: tag },
                        create: { name: tag },
                    })) || [],
                },
            },
            include: { tags: true },
        });

        // Generate subtasks if AI provided them
        if (aiSuggestion.subtasks && aiSuggestion.subtasks.length > 0) {
            const subtaskPromises = aiSuggestion.subtasks.map(subtask => 
                prisma.subtask.create({
                    data: {
                        title: subtask.title || subtask,
                        taskId: newTask.id
                    }
                })
            );
            
            await Promise.all(subtaskPromises);
            
            // Fetch the task again with subtasks included
            const taskWithSubtasks = await prisma.task.findUnique({
                where: { id: newTask.id },
                include: { 
                    tags: true,
                    subtasks: true
                }
            });
            
            // Log AI suggestion to audit table
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    taskId: newTask.id,
                    suggestion: JSON.stringify(aiSuggestion),
                    type: "Task Creation"
                }
            });
            
            return res.status(201).json({ 
                message: "Task created successfully with AI-suggested subtasks", 
                task: taskWithSubtasks,
                aiSuggestion
            });
        }

        res.status(201).json({ 
            message: "Task created successfully", 
            task: newTask,
            aiSuggestion
        });
    } catch (err) {
        console.error("Create Task Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Get all tasks for authenticated user with AI prioritization
exports.getTasks = async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { includeCompleted, includePrioritization } = req.query;

        // Fetch user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const userId = user.id;

        // Build where clause for task query
        const whereClause = {
            userId,
            deletedAt: null, // Don't include soft-deleted tasks
        };

        // Optionally exclude completed tasks
        if (includeCompleted !== 'true') {
            whereClause.status = { not: 'COMPLETED' };
        }

        // Fetch tasks created by the authenticated user, including subtasks
        const tasks = await prisma.task.findMany({
            where: whereClause,
            include: {
                tags: true,
                subtasks: true,
            },
            orderBy: {
                dueDate: 'asc',
            },
        });

        // Perform AI Prioritization if requested
        if (includePrioritization === 'true' && tasks.length > 0) {
            const prioritizedTasks = await suggestTaskPrioritization(tasks);
            
            // Sort tasks according to AI prioritization
            const priorityMap = new Map();
            prioritizedTasks.prioritizedTaskIds.forEach((id, index) => {
                priorityMap.set(id, index);
            });
            
            const sortedTasks = [...tasks].sort((a, b) => {
                const priorityA = priorityMap.has(a.id) ? priorityMap.get(a.id) : Number.MAX_SAFE_INTEGER;
                const priorityB = priorityMap.has(b.id) ? priorityMap.get(b.id) : Number.MAX_SAFE_INTEGER;
                return priorityA - priorityB;
            });
            
            return res.status(200).json({ 
                tasks: sortedTasks, 
                prioritization: {
                    order: prioritizedTasks.prioritizedTaskIds,
                    reasoning: prioritizedTasks.reasoning
                }
            });
        }

        res.status(200).json({ tasks });
    } catch (err) {
        console.error("Get Tasks Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Update a task with AI suggestions
exports.updateTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userEmail = req.user.email;
        const { title, description, dueDate, priority, status, useAiSuggestions } = req.body;

        // Fetch user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const userId = user.id;

        // Check if task exists and belongs to the user
        const existingTask = await prisma.task.findUnique({
            where: { id: taskId },
            select: { 
                userId: true,
                title: true,
                description: true,
                priority: true,
                status: true,
                suggestedPriority: true,
                suggestedDescription: true
            },
        });

        if (!existingTask) {
            return res.status(404).json({ error: "Task not found" });
        }

        if (existingTask.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized to update this task" });
        }

        // Get AI suggestion for task update
        let aiSuggestedUpdate = null;
        
        if (useAiSuggestions === true) {
            aiSuggestedUpdate = await suggestTaskUpdate({ 
                title: title || existingTask.title, 
                description: description || existingTask.description, 
                priority: priority || existingTask.priority,
                status: status || existingTask.status
            });
            
            // Log AI update to audit table
            await prisma.auditLog.create({
                data: {
                    userId,
                    taskId,
                    suggestion: JSON.stringify(aiSuggestedUpdate),
                    type: "Task Update"
                }
            });
        }

        // Prepare update data
        const updateData = {
            title: title || existingTask.title,
            description: description !== undefined ? description : existingTask.description,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            priority: priority || existingTask.priority,
            status: status || existingTask.status,
        };
        
        // Add AI suggestions if requested
        if (useAiSuggestions === true && aiSuggestedUpdate) {
            updateData.suggestedPriority = aiSuggestedUpdate.priority;
            updateData.suggestedDescription = aiSuggestedUpdate.description;
            updateData.aiUpdatedAt = new Date();
            updateData.updatedPriority = `AI suggested: ${aiSuggestedUpdate.priority}`;
            updateData.updatedStatus = `AI suggested: ${aiSuggestedUpdate.status}`;
        }

        // Update task
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: updateData,
            include: { 
                tags: true,
                subtasks: true
            },
        });

        res.status(200).json({ 
            message: "Task updated successfully", 
            task: updatedTask,
            aiSuggestion: aiSuggestedUpdate
        });
    } catch (err) {
        console.error("Update Task Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Delete a task (soft delete)
exports.deleteTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userEmail = req.user.email;
        const { hardDelete } = req.query; // Optional query parameter for hard delete

        // Fetch user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const userId = user.id;

        // Check if task exists and belongs to the user
        const existingTask = await prisma.task.findUnique({
            where: { id: taskId },
            select: { userId: true },
        });

        if (!existingTask) {
            return res.status(404).json({ error: "Task not found" });
        }

        if (existingTask.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized to delete this task" });
        }

        if (hardDelete === 'true') {
            // Hard delete task (permanent)
            await prisma.task.delete({
                where: { id: taskId },
            });
        } else {
            // Soft delete task (set deletedAt timestamp)
            await prisma.task.update({
                where: { id: taskId },
                data: { 
                    deletedAt: new Date(),
                    status: 'ARCHIVED'
                },
            });
        }

        res.status(200).json({ 
            message: hardDelete === 'true' 
                ? "Task permanently deleted" 
                : "Task moved to trash (soft deleted)" 
        });
    } catch (err) {
        console.error("Delete Task Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Create new subtasks for a task (with optional AI generation)
exports.createSubtask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { title, generateWithAi } = req.body;
        const userEmail = req.user.email;

        // Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if task exists and belongs to the user
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { 
                userId: true,
                title: true,
                description: true,
                dueDate: true,
                priority: true,
                status: true
            },
        });

        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }

        if (task.userId !== user.id) {
            return res.status(403).json({ error: "Unauthorized to add a subtask to this task" });
        }

        // Handle AI-generated subtasks
        if (generateWithAi === true) {
            const suggestedSubtasks = await suggestSubtasks(task);
            
            if (suggestedSubtasks && suggestedSubtasks.length > 0) {
                const subtaskPromises = suggestedSubtasks.map(subtask => 
                    prisma.subtask.create({
                        data: {
                            title: subtask.title || subtask,
                            taskId
                        }
                    })
                );
                
                const createdSubtasks = await Promise.all(subtaskPromises);
                
                // Log AI suggestion to audit table
                await prisma.auditLog.create({
                    data: {
                        userId: user.id,
                        taskId,
                        suggestion: JSON.stringify(suggestedSubtasks),
                        type: "Subtask Generation"
                    }
                });
                
                return res.status(201).json({ 
                    message: "AI-generated subtasks created successfully", 
                    subtasks: createdSubtasks
                });
            } else {
                return res.status(400).json({ 
                    error: "AI was unable to generate subtasks for this task" 
                });
            }
        }

        // Handle manual subtask creation
        if (!title) {
            return res.status(400).json({ error: "Subtask title is required" });
        }

        // Create a new subtask for the task
        const newSubtask = await prisma.subtask.create({
            data: {
                title,
                taskId,
            },
        });

        res.status(201).json({ 
            message: "Subtask created successfully", 
            subtask: newSubtask 
        });
    } catch (err) {
        console.error("Create Subtask Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Get all subtasks for a specific task
exports.getSubtasks = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userEmail = req.user.email;

        // Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if task exists and belongs to the user
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { userId: true },
        });

        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }

        if (task.userId !== user.id) {
            return res.status(403).json({ error: "Unauthorized to view subtasks for this task" });
        }

        // Fetch all subtasks for the task
        const subtasks = await prisma.subtask.findMany({
            where: { taskId },
            orderBy: {
                completed: 'asc', // Show uncompleted tasks first
            },
        });

        res.status(200).json({ subtasks });
    } catch (err) {
        console.error("Get Subtasks Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Update a subtask
exports.updateSubtask = async (req, res) => {
    try {
        const { taskId, subtaskId } = req.params;
        const { title, completed } = req.body;
        const userEmail = req.user.email;

        // Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if task exists and belongs to the user
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { userId: true },
        });

        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }

        if (task.userId !== user.id) {
            return res.status(403).json({ error: "Unauthorized to update subtasks for this task" });
        }

        // Check if subtask exists and belongs to the task
        const subtask = await prisma.subtask.findUnique({
            where: { id: subtaskId },
            select: { taskId: true },
        });

        if (!subtask) {
            return res.status(404).json({ error: "Subtask not found" });
        }

        if (subtask.taskId !== taskId) {
            return res.status(403).json({ error: "Subtask does not belong to the specified task" });
        }

        // Update the subtask
        const updatedSubtask = await prisma.subtask.update({
            where: { id: subtaskId },
            data: {
                title: title !== undefined ? title : undefined,
                completed: completed !== undefined ? completed : undefined,
            },
        });

        // If all subtasks are completed, update the task status
        if (completed === true) {
            const allSubtasks = await prisma.subtask.findMany({
                where: { taskId },
            });
            
            const allCompleted = allSubtasks.every(s => s.completed);
            
            if (allCompleted) {
                await prisma.task.update({
                    where: { id: taskId },
                    data: { 
                        status: 'COMPLETED',
                        updatedStatus: 'Automatically completed (all subtasks done)'
                    },
                });
            }
        }

        res.status(200).json({ message: "Subtask updated successfully", subtask: updatedSubtask });
    } catch (err) {
        console.error("Update Subtask Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Completion of deleteSubtask function
exports.deleteSubtask = async (req, res) => {
    try {
        const { taskId, subtaskId } = req.params;
        const userEmail = req.user.email;

        // Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if task exists and belongs to the user
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { userId: true },
        });

        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }

        if (task.userId !== user.id) {
            return res.status(403).json({ error: "Unauthorized to delete subtasks for this task" });
        }

        // Check if subtask exists and belongs to the task
        const subtask = await prisma.subtask.findUnique({
            where: { id: subtaskId },
            select: { taskId: true },
        });

        if (!subtask) {
            return res.status(404).json({ error: "Subtask not found" });
        }

        if (subtask.taskId !== taskId) {
            return res.status(403).json({ error: "Subtask does not belong to the specified task" });
        }

        // Delete the subtask
        await prisma.subtask.delete({
            where: { id: subtaskId },
        });

        res.status(200).json({ message: "Subtask deleted successfully" });
    } catch (err) {
        console.error("Delete Subtask Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Get workload analysis for user with AI insights
exports.getWorkloadAnalysis = async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { timeframe } = req.query; // 'week', 'month', 'quarter'

        // Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Calculate date range based on timeframe
        const today = new Date();
        let startDate = new Date();
        
        switch (timeframe) {
            case 'week':
                startDate.setDate(today.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(today.getMonth() - 1);
                break;
            case 'quarter':
                startDate.setMonth(today.getMonth() - 3);
                break;
            default:
                // Default to 2 weeks
                startDate.setDate(today.getDate() - 14);
        }

        // Get all tasks within the time range
        const tasks = await prisma.task.findMany({
            where: {
                userId: user.id,
                dueDate: {
                    gte: startDate,
                    lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000) // Include upcoming 30 days
                },
                deletedAt: null
            },
            include: {
                subtasks: true,
                tags: true
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        // Get task statistics
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(task => task.status === 'COMPLETED').length;
        const overdueTasks = tasks.filter(task => 
            task.status !== 'COMPLETED' && 
            new Date(task.dueDate) < today
        ).length;
        
        // Get subtask statistics
        const allSubtasks = tasks.flatMap(task => task.subtasks);
        const totalSubtasks = allSubtasks.length;
        const completedSubtasks = allSubtasks.filter(subtask => subtask.completed).length;

        // Group tasks by priority
        const tasksByPriority = {
            HIGH: tasks.filter(task => task.priority === 'HIGH').length,
            MEDIUM: tasks.filter(task => task.priority === 'MEDIUM').length,
            LOW: tasks.filter(task => task.priority === 'LOW').length
        };

        // Group tasks by tag
        const tasksByTag = {};
        tasks.forEach(task => {
            task.tags.forEach(tag => {
                if (!tasksByTag[tag.name]) {
                    tasksByTag[tag.name] = 0;
                }
                tasksByTag[tag.name]++;
            });
        });

        // Get upcoming deadlines (next 7 days)
        const upcomingDeadline = new Date();
        upcomingDeadline.setDate(today.getDate() + 7);
        
        const upcomingTasks = tasks.filter(task => 
            task.status !== 'COMPLETED' && 
            new Date(task.dueDate) >= today &&
            new Date(task.dueDate) <= upcomingDeadline
        );

        // Calculate completion rate
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(2) : 0;

        // Get AI analysis of workload
        const workloadAnalysis = await analyzeWorkload({
            totalTasks,
            completedTasks,
            overdueTasks,
            tasksByPriority,
            upcomingTasks: upcomingTasks.length,
            completionRate
        });

        // Compile workload summary
        const workloadSummary = {
            timeframe,
            overview: {
                totalTasks,
                completedTasks,
                overdueTasks,
                completionRate: parseFloat(completionRate),
                upcomingDeadlines: upcomingTasks.length
            },
            tasksByPriority,
            tasksByTag,
            subtasks: {
                total: totalSubtasks,
                completed: completedSubtasks,
                completionRate: totalSubtasks > 0 ? (completedSubtasks / totalSubtasks * 100).toFixed(2) : 0
            },
            upcomingTasks: upcomingTasks.map(task => ({
                id: task.id,
                title: task.title,
                dueDate: task.dueDate,
                priority: task.priority,
                status: task.status,
                subtasksCount: task.subtasks.length,
                completedSubtasks: task.subtasks.filter(s => s.completed).length
            })),
            aiAnalysis: workloadAnalysis
        };

        res.status(200).json({ workloadSummary });
    } catch (err) {
        console.error("Workload Analysis Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Restore a deleted task (undo soft delete)
exports.restoreTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userEmail = req.user.email;

        // Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if deleted task exists and belongs to the user
        const deletedTask = await prisma.task.findUnique({
            where: { id: taskId },
            select: { 
                userId: true,
                deletedAt: true,
                status: true
            },
        });

        if (!deletedTask) {
            return res.status(404).json({ error: "Task not found" });
        }

        if (deletedTask.userId !== user.id) {
            return res.status(403).json({ error: "Unauthorized to restore this task" });
        }

        if (!deletedTask.deletedAt) {
            return res.status(400).json({ error: "Task is not in trash" });
        }

        // Restore the task (clear deletedAt timestamp)
        const restoredTask = await prisma.task.update({
            where: { id: taskId },
            data: { 
                deletedAt: null,
                status: deletedTask.status === 'ARCHIVED' ? 'IN_PROGRESS' : deletedTask.status
            },
            include: {
                tags: true,
                subtasks: true
            }
        });

        res.status(200).json({ 
            message: "Task restored successfully", 
            task: restoredTask 
        });
    } catch (err) {
        console.error("Restore Task Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Get all deleted tasks (trash bin)
exports.getDeletedTasks = async (req, res) => {
    try {
        const userEmail = req.user.email;

        // Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Fetch soft-deleted tasks for the user
        const deletedTasks = await prisma.task.findMany({
            where: {
                userId: user.id,
                deletedAt: { not: null }
            },
            include: {
                tags: true,
                subtasks: true
            },
            orderBy: {
                deletedAt: 'desc' // Most recently deleted first
            }
        });

        res.status(200).json({ deletedTasks });
    } catch (err) {
        console.error("Get Deleted Tasks Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Permanently delete all tasks in trash
exports.emptyTrash = async (req, res) => {
    try {
        const userEmail = req.user.email;

        // Get user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Get IDs of all deleted tasks
        const deletedTasks = await prisma.task.findMany({
            where: {
                userId: user.id,
                deletedAt: { not: null }
            },
            select: { id: true }
        });

        const deletedTaskIds = deletedTasks.map(task => task.id);

        if (deletedTaskIds.length === 0) {
            return res.status(200).json({ message: "No tasks in trash to delete" });
        }

        // Delete all subtasks associated with these tasks
        await prisma.subtask.deleteMany({
            where: {
                taskId: { in: deletedTaskIds }
            }
        });

        // Delete the tasks permanently
        const { count } = await prisma.task.deleteMany({
            where: {
                id: { in: deletedTaskIds }
            }
        });

        res.status(200).json({ 
            message: `Successfully emptied trash: ${count} tasks permanently deleted` 
        });
    } catch (err) {
        console.error("Empty Trash Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};