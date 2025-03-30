const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { connectDB, prisma } = require("./config/db"); // Import DB setup
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 📝 Test API
app.get("/", (req, res) => {
    res.send("Task Tracker API is Running!");
});

// Add a route to check DB connection status
app.get("/api/db-status", async (req, res) => {
    try {
        await prisma.$connect();
        res.json({ status: "connected", message: "Database connection successful" });
    } catch (error) {
        res.json({ status: "disconnected", message: "Database connection failed", error });
    }
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api", userRoutes);
app.use("/api/tasks", taskRoutes);

// ✅ Start Server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    await connectDB(); // Ensure DB is connected before processing requests
});

// Graceful shutdown
process.on("SIGINT", async () => {
    await prisma.$disconnect();
    console.log("🛑 Prisma disconnected. Server shutting down.");
    process.exit(0);
});
