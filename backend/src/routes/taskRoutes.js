const express = require("express");
const { authenticateUser } = require("../middlewares/authenticateUser");
const { createTask, getTasks, updateTask, deleteTask, createSubtask, getSubtasks, updateSubtask, deleteSubtask } = require("../controllers/taskController");

const router = express.Router();

// Task Routes
router.post("/", authenticateUser, createTask);
router.get("/", authenticateUser, getTasks);
router.put("/:taskId", authenticateUser, updateTask);
router.delete("/:taskId", authenticateUser, deleteTask);

// Subtask Routes
router.post("/:taskId/subtasks", authenticateUser, createSubtask);
router.get("/:taskId/subtasks", authenticateUser, getSubtasks);
router.put("/:taskId/subtasks/:subtaskId", authenticateUser, updateSubtask);
router.delete("/:taskId/subtasks/:subtaskId", authenticateUser, deleteSubtask);

module.exports = router;
