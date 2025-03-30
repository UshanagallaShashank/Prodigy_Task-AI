const { prisma, supabase } = require("../config/supabase");

// ✅ Create a new task (Personal)
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

        // ✅ Insert task into the database
        const newTask = await prisma.task.create({
            data: {
                title,
                description,
                dueDate: new Date(dueDate),
                priority: priority || "MEDIUM",
                userId: user.id,
                tags: {
                    connectOrCreate: tags?.map(tag => ({
                        where: { name: tag },
                        create: { name: tag },
                    })) || [],
                },
            },
            include: { tags: true }, // ✅ Return tags along with task details
        });

        res.status(201).json({ message: "Task created successfully", task: newTask });
    } catch (err) {
        console.error("Create Task Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Get all tasks for authenticated user
exports.getTasks = async (req, res) => {
    try {
        const userEmail = req.user.email; // Extract user email from token

        // Fetch user ID using email
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const userId = user.id;

        // Fetch tasks created by the authenticated user, including subtasks
        const tasks = await prisma.task.findMany({
            where: { userId },
            include: {
                tags: true,
                subtasks: true, // Include subtasks for each task
            },
        });

        res.status(200).json({ tasks });
    } catch (err) {
        console.error("Get Tasks Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Update a task (Only the owner can update)
exports.updateTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userEmail = req.user.email;
        const { title, description, dueDate, priority, status } = req.body;

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
            return res.status(403).json({ error: "Unauthorized to update this task" });
        }

        // Update task
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: {
                title,
                description,
                dueDate: new Date(dueDate),
                priority,
                status,
            },
            include: { tags: true },
        });

        res.status(200).json({ message: "Task updated successfully", task: updatedTask });
    } catch (err) {
        console.error("Update Task Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Delete a task (Only the owner can delete)
exports.deleteTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userEmail = req.user.email;

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

        // Delete task
        await prisma.task.delete({
            where: { id: taskId },
        });

        res.status(200).json({ message: "Task deleted successfully" });
    } catch (err) {
        console.error("Delete Task Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Create a new subtask for a task
exports.createSubtask = async (req, res) => {
    try {
        const { taskId } = req.params; // Task ID from URL
        const { title } = req.body; // Title of the subtask
        const userEmail = req.user.email; // Extract user email from token

        if (!title) {
            return res.status(400).json({ error: "Subtask title is required" });
        }

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
            return res.status(403).json({ error: "Unauthorized to add a subtask to this task" });
        }

        // Create a new subtask for the task
        const newSubtask = await prisma.subtask.create({
            data: {
                title,
                taskId,
            },
        });

        res.status(201).json({ message: "Subtask created successfully", subtask: newSubtask });
    } catch (err) {
        console.error("Create Subtask Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Get all subtasks for a specific task
exports.getSubtasks = async (req, res) => {
    try {
        const { taskId } = req.params; // Task ID from URL
        const userEmail = req.user.email; // Extract user email from token

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
        const { taskId, subtaskId } = req.params; // Task ID and Subtask ID from URL
        const { title, completed } = req.body; // Update fields

        const userEmail = req.user.email; // Extract user email from token

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
                title: title || subtask.title,
                completed: completed !== undefined ? completed : subtask.completed,
            },
        });

        res.status(200).json({ message: "Subtask updated successfully", subtask: updatedSubtask });
    } catch (err) {
        console.error("Update Subtask Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Delete a subtask
exports.deleteSubtask = async (req, res) => {
    try {
        const { taskId, subtaskId } = req.params; // Task ID and Subtask ID from URL
        const userEmail = req.user.email; // Extract user email from token

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
        });

        if (!subtask) {
            return res.status(404).json({ error: "Subtask not found" });
        }

        if (subtask.taskId !== taskId) {
            return res.status(403).json({ error: "Subtask does not belong to the specified task" });
        }

        // Delete subtask
        await prisma.subtask.delete({
            where: { id: subtaskId },
        });

        res.status(200).json({ message: "Subtask deleted successfully" });
    } catch (err) {
        console.error("Delete Subtask Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
