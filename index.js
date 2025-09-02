const express = require("express");
const session = require("express-session");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");

const app = express();
const prisma = new PrismaClient();
const { transporter } = require("./utils/mailer");

// -------------------- MIDDLEWARE --------------------
const isProduction = process.env.NODE_ENV === "production";

app.use(cors({
  origin: "http://localhost:5173", // frontend URL
  credentials: true
}));


app.use(express.json());

// -------------------- SESSION --------------------

app.use(session({
  secret: "your_secret_key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,       // ✅ HTTPS required in production
    sameSite: isProduction ? "none" : "lax",  // ✅ cross-origin
    httpOnly: true
  }
}));


// ==================== USER ROUTES ====================
app.post("/newuser", async (req, res) => {
  try {
    let { username, password, name, email, phoneNumber } = req.body;

    username = username?.trim();
    password = password?.trim();
    email = email?.trim();
    phoneNumber = phoneNumber?.trim();

    if (!username || !password || !email || !phoneNumber) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingUser = await prisma.userDetails.findFirst({
      where: {
        OR: [{ username }, { email }, { phoneNumber }]
      }
    });

    if (existingUser) {
      const conflictField = existingUser.username === username
        ? "Username"
        : existingUser.email === email
        ? "Email"
        : "Phone number";
      return res.status(400).json({ error: `${conflictField} already exists` });
    }

    const newUser = await prisma.userDetails.create({
      data: { username, password, name, email, phoneNumber }
    });

    res.status(201).json({ message: "User created successfully", user: newUser });
  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    let { username, password } = req.body;
    username = username?.trim();
    password = password?.trim();

    if (!username || !password) {
      return res.status(400).json({ message: "username and password required" });
    }

    const user = await prisma.userDetails.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ message: "Invalid username" });

    if (password !== user.password) return res.status(401).json({ message: "Invalid password" });

    req.session.userId = user.id;
    res.json({ message: "Login successful", userId: user.id });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: "Logout failed" });
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out successfully" });
  });
});

// ==================== PRODUCT ROUTES ====================
app.get("/products", async (req, res) => {
  try {
    const data = await prisma.product.findMany();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.get("/products/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const data = await prisma.product.findMany({ where: { category } });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/newproducts", async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ error: "data must be an array" });

    const created = await prisma.product.createMany({ data, skipDuplicates: true });
    res.json({ message: "Products created", count: created.count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create products" });
  }
});

// ==================== CART ROUTES ====================
app.post("/cartpost", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  const { productId, quantity } = req.body;
  try {
    const cartItem = await prisma.cart.create({
      data: { productId, quantity, userId: req.session.userId },
      include: { product: true }
    });
    res.json(cartItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.get("/cart", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  try {
    const cart = await prisma.cart.findMany({
      where: { userId: req.session.userId },
      include: { product: true }
    });
    res.json(cart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.delete("/cart/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  const cartId = parseInt(req.params.id, 10);
  try {
    const cartItem = await prisma.cart.findUnique({ where: { id: cartId } });
    if (!cartItem || cartItem.userId !== req.session.userId) return res.status(404).json({ error: "Cart item not found" });

    await prisma.cart.delete({ where: { id: cartId } });
    res.json({ message: "Cart item deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
