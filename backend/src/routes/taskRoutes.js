const express = require("express");
const { authenticateUser } = require("../middlewares/authenticateUser");
const {
    createTask,
    getTasks,
    updateTask,
    deleteTask,
    createSubtask,
    getSubtasks,
    updateSubtask,
    deleteSubtask,
    getWorkloadAnalysis,
    restoreTask,
    getDeletedTasks,
    emptyTrash
} = require("../controllers/taskController");

const router = express.Router();

// Task Routes
router.post("/", authenticateUser, createTask); // Create a Task
router.get("/", authenticateUser, getTasks); // Get All Tasks for Authenticated User
router.put("/:taskId", authenticateUser, updateTask); // Update a Task
router.delete("/:taskId", authenticateUser, deleteTask); // Delete a Task (Soft Delete)

// Subtask Routes
router.post("/:taskId/subtasks", authenticateUser, createSubtask); // Create a Subtask for a Task
router.get("/:taskId/subtasks", authenticateUser, getSubtasks); // Get all Subtasks for a Task
router.put("/:taskId/subtasks/:subtaskId", authenticateUser, updateSubtask); // Update a Subtask
router.delete("/:taskId/subtasks/:subtaskId", authenticateUser, deleteSubtask); // Delete a Subtask

// Workload Analysis Routes
router.get("/workload", authenticateUser, getWorkloadAnalysis); // Get Workload Analysis

// Trash Routes
router.get("/trash", authenticateUser, getDeletedTasks); // Get Deleted Tasks (Trash Bin)
router.post("/:taskId/restore", authenticateUser, restoreTask); // Restore a Task from Trash
router.delete("/trash", authenticateUser, emptyTrash); // Empty Trash (Permanently Delete All Trashed Tasks)

module.exports = router;
