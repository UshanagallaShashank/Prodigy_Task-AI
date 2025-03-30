const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Check database connection
async function checkDatabaseConnection() {
  try {
    // Execute a simple query to test the connection
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

// 📝 Test API
app.get("/", (req, res) => {
    res.send("Task Tracker API is Running!");
});

// Add a route to check DB connection status
app.get("/api/db-status", async (req, res) => {
    const isConnected = await checkDatabaseConnection();
    res.json({ 
        status: isConnected ? "connected" : "disconnected",
        message: isConnected ? "Database connection successful" : "Database connection failed"
    });
});
app.use("/api/auth", authRoutes);
app.use("/api", userRoutes);

// ✅ Start Server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    // Check DB connection on server start
    await checkDatabaseConnection();
});

// Properly close the Prisma connection when the app terminates
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});