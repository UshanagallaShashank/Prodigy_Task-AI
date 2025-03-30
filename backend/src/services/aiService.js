const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
dotenv.config();

// Initialize the GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Initialize the generative model for "gemini-2.0-flash"
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

module.exports = {
    suggestTaskDetails: async ({ title, description, dueDate }) => {
        try {
            const prompt = `
You are a task management assistant helping users organize their work.
Based on the following task information, provide a concise, structured response:

Title: ${title}
Description: ${description || 'No description provided'}
Due Date: ${dueDate}

Please return a JSON object with the following structure:
{
  "priority": "HIGH" or "MEDIUM" or "LOW" based on urgency and importance,
  "description": A concise, enhanced description with key action items (max 300 words),
  "estimatedTime": estimated time to complete in hours,
  "subtasks": [array of 3-5 key subtasks to complete this task]
}
`;
            
            const result = await model.generateContent(prompt);
            const response = result.response;
            const textResponse = response.text();
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);

            let suggestion = {};
            if (jsonMatch) {
                try {
                    suggestion = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error('JSON parsing error:', e);
                }
            }

            return {
                priority: suggestion.priority || 'MEDIUM',
                description: suggestion.description || textResponse.substring(0, 1000) || description || '',
                estimatedTime: suggestion.estimatedTime || null,
                subtasks: suggestion.subtasks || []
            };
        } catch (err) {
            console.error('AI Suggestion Error:', err);
            return {
                priority: 'MEDIUM',
                description: description || ''
            };
        }
    },
    
    suggestTaskUpdate: async ({ title, description, priority, status }) => {
        try {
            const prompt = `
You are a task management assistant helping users update their tasks.
Based on the following task information, suggest improvements:

Title: ${title || 'N/A'}
Description: ${description || 'N/A'}
Current Priority: ${priority || 'MEDIUM'}
Current Status: ${status || 'PENDING'}

Please return a JSON object with the following structure:
{
  "priority": suggested priority level ("HIGH", "MEDIUM", "LOW", or "CRITICAL"),
  "status": suggested status update if any ("PENDING", "IN_PROGRESS", "COMPLETED", "ARCHIVED"),
  "description": enhanced description with clear action items if the original is insufficient
}
`;
            
            const result = await model.generateContent(prompt);
            const response = result.response;
            const textResponse = response.text();
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);

            let suggestion = {};
            if (jsonMatch) {
                try {
                    suggestion = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error('JSON parsing error:', e);
                }
            }

            return {
                priority: suggestion.priority || priority || 'MEDIUM',
                status: suggestion.status || status || 'PENDING',
                description: suggestion.description || description || ''
            };
        } catch (err) {
            console.error('AI Update Suggestion Error:', err);
            return {
                priority: priority || 'MEDIUM',
                status: status || 'PENDING',
                description: description || ''
            };
        }
    },
    
    suggestTaskPrioritization: async (tasks) => {
        try {
            if (!Array.isArray(tasks) || tasks.length === 0) {
                return {
                    prioritizedTaskIds: [],
                    reasoning: "No tasks to prioritize"
                };
            }

            const prompt = `
You are a task prioritization assistant.
Prioritize the following tasks based on importance, deadlines, and urgency:

${tasks.map((task, index) => {
    const dueDate = task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : 'No due date';
    return `${index + 1}. ${task.title} - Due: ${dueDate} - Priority: ${task.priority || 'MEDIUM'} - Status: ${task.status || 'PENDING'}`;
}).join('\n')}

Please return a JSON array of task IDs in order of recommended priority, with the most important first:
{
  "prioritizedTaskIds": [${tasks.map(task => `"${task.id}"`).join(', ')}],
  "reasoning": "brief explanation of your prioritization logic"
}
`;
            
            const result = await model.generateContent(prompt);
            const response = result.response;
            const textResponse = response.text();
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                try {
                    const prioritization = JSON.parse(jsonMatch[0]);
                    const existingIds = new Set(prioritization.prioritizedTaskIds || []);
                    const allTaskIds = tasks.map(task => task.id);

                    allTaskIds.forEach(id => {
                        if (!existingIds.has(id)) {
                            prioritization.prioritizedTaskIds.push(id);
                        }
                    });

                    return {
                        prioritizedTaskIds: prioritization.prioritizedTaskIds || allTaskIds,
                        reasoning: prioritization.reasoning || "Tasks prioritized based on deadlines and importance"
                    };
                } catch (e) {
                    console.error('JSON parsing error:', e);
                }
            }

            return {
                prioritizedTaskIds: tasks.map(task => task.id),
                reasoning: textResponse.substring(0, 500) || "Tasks prioritized by default order"
            };
        } catch (err) {
            console.error('AI Prioritization Error:', err);
            return {
                prioritizedTaskIds: [],
                reasoning: "Error occurred during prioritization"
            };
        }
    },
    
    suggestSubtasks: async (task) => {
        try {
            const prompt = `
You are a task management assistant helping users break down their tasks into actionable subtasks.
Based on the following task information, suggest 3-5 specific subtasks:

Title: ${task.title}
Description: ${task.description || 'No description provided'}
Due Date: ${task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : 'No due date'}
Priority: ${task.priority || 'MEDIUM'}

Please return a JSON array of subtasks:
{
  "subtasks": [
    {"title": "First subtask description", "estimated_minutes": 30},
    {"title": "Second subtask description", "estimated_minutes": 45},
    ...
  ]
}
`;
            
            const result = await model.generateContent(prompt);
            const response = result.response;
            const textResponse = response.text();
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                try {
                    const suggestion = JSON.parse(jsonMatch[0]);
                    return suggestion.subtasks || [];
                } catch (e) {
                    console.error('JSON parsing error:', e);
                }
            }

            return [];
        } catch (err) {
            console.error('AI Subtask Suggestion Error:', err);
            return [];
        }
    },
    
    analyzeWorkload: async (tasks, timeframe = 'week') => {
        try {
            if (!Array.isArray(tasks)) {
                return {
                    analysis: "Invalid input: tasks should be an array.",
                    recommendations: [],
                    overloaded_days: [],
                    estimated_total_hours: 0
                };
            }

            if (tasks.length === 0) {
                return {
                    analysis: "No tasks to analyze",
                    recommendations: []
                };
            }

            const prompt = `
You are a workload management assistant analyzing a user's tasks.
Based on the following tasks, provide a workload analysis:

${tasks.map((task, index) => {
                const dueDate = task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : 'No due date';
                return `${index + 1}. ${task.title} - Due: ${dueDate} - Priority: ${task.priority || 'MEDIUM'} - Status: ${task.status || 'PENDING'}`;
            }).join('\n')}

Timeframe: ${timeframe}

Please return a JSON object with:
{
    "analysis": "Brief workload analysis for the ${timeframe}",
    "recommendations": ["1-3 specific recommendations for better managing tasks"],
    "overloaded_days": ["YYYY-MM-DD dates that seem to have too many high-priority tasks"],
    "estimated_total_hours": approximate total hours of work represented by these tasks
}
`;
            
            const result = await model.generateContent(prompt);
            const response = result.response;
            const textResponse = response.text();
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error('JSON parsing error:', e);
                    return {
                        analysis: textResponse.substring(0, 500) || "Workload analysis completed",
                        recommendations: [],
                        overloaded_days: [],
                        estimated_total_hours: 0
                    };
                }
            } else {
                return {
                    analysis: textResponse.substring(0, 500) || "Workload analysis completed",
                    recommendations: [],
                    overloaded_days: [],
                    estimated_total_hours: 0
                };
            }
        } catch (err) {
            console.error('AI Workload Analysis Error:', err);
            return {
                analysis: "Error analyzing workload",
                recommendations: [],
                overloaded_days: [],
                estimated_total_hours: 0
            };
        }
    }
};