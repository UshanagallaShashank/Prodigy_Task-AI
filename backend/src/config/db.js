const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Function to check and connect to DB
async function connectDB() {
    try {
        await prisma.$connect();
        console.log("✅ Database connected successfully");
    } catch (error) {
        console.error("❌ Database connection failed:", error);
        process.exit(1); // Exit process on failure
    }
}

module.exports = { prisma, connectDB };
