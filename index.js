const express = require("express");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: "http://localhost:5173",  // frontend URL
  methods: ["GET","POST","PUT","DELETE"],
  credentials: true
}));

// Middleware to parse JSON
app.use(express.json());

// ✅ User registration route
app.post("/newuser", async (req, res) => {
  try {
    const { username, password, name, email, phoneNumber } = req.body;

    // Basic validation
    if (!username || !password || !email || !phoneNumber) {
      return res.status(400).json({ error: "username, password, email, and phoneNumber are required" });
    }

    // 🔍 Check if any existing user has same username, email, or phoneNumber
    const existingUser = await prisma.userDetails.findFirst({
      where: {
        OR: [
          { username },
          { email },
          { phoneNumber },
        ],
      },
    });

    if (existingUser) {
      let conflictField = existingUser.username === username
        ? "Username"
        : existingUser.email === email
        ? "Email"
        : "Phone number";

      return res.status(400).json({ error: `${conflictField} already exists` });
    }

    // ✅ Create user
    const newUser = await prisma.userDetails.create({
      data: {
        username,
        password, // ⚠️ should be hashed in production!
        name,
        email,
        phoneNumber,
      },
    });

    res.status(201).json({ message: "User created successfully", user: newUser });
  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});


app.get("/products", async (req, res) => {
  try {
    const data = await prisma.product.findMany();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// POST new products (bulk insert)
app.post("/newproducts", async (req, res) => {
  try {
    const { data } = req.body; // expecting { "data": [ ... ] }

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: "Request body must include { data: [...] }" });
    }

    const created = await prisma.product.createMany({
      data: data,
      skipDuplicates: true, // avoids inserting duplicates
    });

    res.json({ message: "Products created", count: created.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create products" });
  }
});

// Start server
app.listen(3000, () => {
  console.log("🚀 Server is Running at http://localhost:3000");
});
