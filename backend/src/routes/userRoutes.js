const express = require("express");
const { getAllUsers } = require("../controllers/userController");
const { isAdmin } = require("../middlewares/authMiddleware");
const { authenticateUser } = require("../middlewares/authenticateUser");

const router = express.Router();

// 📌 Apply authentication and isAdmin middleware
router.get("/users", authenticateUser, isAdmin, getAllUsers);

module.exports = router;
