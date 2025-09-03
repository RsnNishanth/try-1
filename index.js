require("dotenv").config();
const express = require("express");
const session = require("express-session");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const { transporter } = require("./utils/mailer");

const app = express();
const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === "production";

// ---------- MIDDLEWARE ----------
app.use(cors({
  origin: ["http://localhost:5173", "https://try-1fe.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true, // ✅ allow cookies
}));
app.use(express.json());

// ✅ Session middleware must be before routes
app.use(session({
  name: "connect.sid", // ✅ standard cookie name
  secret: process.env.SESSION_SECRET || "supersecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,        // ✅ true only when deployed on HTTPS
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax", // ✅ cross-site cookie support
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  },
}));

// ==================== USER ROUTES ====================
app.post("/newuser", async (req, res) => {
  try {
    const { username, password, name, email, phoneNumber } = req.body;

    if (!username || !password || !email || !phoneNumber) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingUser = await prisma.userDetails.findFirst({
      where: { OR: [{ username }, { email }, { phoneNumber }] },
    });

    if (existingUser) {
      const conflictField =
        existingUser.username === username
          ? "Username"
          : existingUser.email === email
          ? "Email"
          : "Phone number";
      return res.status(400).json({ error: `${conflictField} already exists` });
    }

    const newUser = await prisma.userDetails.create({
      data: { username, password, name, email, phoneNumber },
    });

    res.status(201).json({ message: "User created successfully", user: newUser });
  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username & password required" });
    }

    const user = await prisma.userDetails.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ message: "Invalid username" });

    if (password !== user.password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // ✅ Save session only after password check
    req.session.userId = user.id;

    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).json({ message: "Login failed" });
      }

      console.log("✅ Session created:", req.session);

      // ✅ explicitly send cookie (important for Render + Vercel combo)
      res.cookie("connect.sid", req.sessionID, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.json({ message: "Login successful", userId: user.id });
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: "Logout failed" });

    res.clearCookie("connect.sid", {
      path: "/",
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
    });
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
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: "Data must be an array" });
    }

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
      include: { product: true },
    });
    res.json(cartItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/cart", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  try {
    const cart = await prisma.cart.findMany({
      where: { userId: req.session.userId },
      include: { product: true },
    });
    res.json(cart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/cart/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  const cartId = parseInt(req.params.id, 10);
  try {
    const cartItem = await prisma.cart.findUnique({ where: { id: cartId } });
    if (!cartItem || cartItem.userId !== req.session.userId) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    await prisma.cart.delete({ where: { id: cartId } });
    res.json({ message: "Cart item deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ==================== SEND CART EMAIL ====================
app.post("/cart/send-email", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  try {
    const cartItems = await prisma.cart.findMany({
      where: { userId: req.session.userId },
      include: { product: true },
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const user = await prisma.userDetails.findUnique({
      where: { id: req.session.userId },
    });

    const productList = cartItems
      .map((item) => `- ${item.product.title} (${item.quantity})`)
      .join("\n");

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Your Cart Order",
      text: `Hello ${user.name},\n\nYour cart contains:\n${productList}\n\nThank you!`,
    });

    res.json({ message: "Cart email sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
