const express = require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");

const app = express();
const prisma = new PrismaClient();

const { transporter } = require("./utils/mailer");


app.use(cors({
  origin: "http://localhost:5173",  // frontend URL
  methods: ["GET","POST","PUT","DELETE"],
  credentials: true
}));

// Middleware to parse JSON
app.use(express.json());

//SESSION
app.use(session({
  secret: "your_secret_key",
  resave:false,
  saveUninitialized:false,
  cookie:{
    secure:false
  }
}));

// ✅ User registration route
// ✅ User registration route
app.post("/newuser", async (req, res) => {
  try {
    let { username, password, name, email, phoneNumber } = req.body;

    // Trim inputs
    username = username?.trim();
    password = password?.trim();
    email = email?.trim();
    phoneNumber = phoneNumber?.trim();

    // Basic validation
    if (!username || !password || !email || !phoneNumber) {
      return res.status(400).json({ error: "username, password, email, and phoneNumber are required" });
    }

    // Check if any existing user has same username, email, or phoneNumber
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

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await prisma.userDetails.create({
      data: {
        username,
        password: hashedPassword,
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


//Products
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

//category-Products
app.get("/products/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const data = await prisma.product.findMany({
      where: { category }
    });
    res.json(data);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// ✅ Login endpoint
// ✅ Login endpoint
app.post("/login", async (req, res) => {
  try {
    let { username, password } = req.body;

    // Trim inputs
    username = username?.trim();
    password = password?.trim();

    if (!username || !password) {
      return res.status(400).json({ message: "username and password are required" });
    }

    const user = await prisma.userDetails.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid username" });
    }

    // Compare hashed password
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Create session
    req.session.userId = user.id;

    res.json({ message: "Login successful", userId: user.id });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
});



//AddingCart
app.post("/cartpost", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "not Logged in" });
  }

  const { productId, quantity } = req.body;

  try {
    const cartItem = await prisma.cart.create({
      data: {
        productId,
        quantity,
        userId: req.session.userId,
      },
      include: {
        product: true,
      },
    });

    res.json(cartItem);
  } catch (err) {
    console.error("❌ Error adding to cart:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});


//Geting-Cart
app.get("/cart", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "not Logged in" });
  }

  try {
    const cart = await prisma.cart.findMany({
      where: {
        userId: req.session.userId,
      },
      include: {
        product: true, // 👈 this gives you full Product details
      },
    });

    res.json(cart);
  } catch (err) {
    console.error("❌ Error fetching cart:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});


//Logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("❌ Logout error:", err);
      return res.status(500).json({ message: "Logout failed" });
    }
    res.clearCookie("connect.sid");   // ✅ clears session cookie
    res.json({ message: "Logged out successfully" });
  });
});


//delete-cartitem
app.delete("/cart/:id", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "not Logged in" });
  }

  const cartId = parseInt(req.params.id, 10);

  try {
    // make sure the item belongs to the logged-in user
    const cartItem = await prisma.cart.findUnique({
      where: { id: cartId },
    });

    if (!cartItem || cartItem.userId !== req.session.userId) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    await prisma.cart.delete({
      where: { id: cartId },
    });

    res.json({ message: "Cart item deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting cart item:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

//Buy-Cart
// ✅ Send cart to email and clear after sending
app.post("/send-cart-email", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    // Fetch user details
    const user = await prisma.userDetails.findUnique({
      where: { id: req.session.userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Fetch cart items
    const cartItems = await prisma.cart.findMany({
      where: { userId: req.session.userId },
      include: { product: true },
    });

    if (!cartItems || cartItems.length === 0) {
      return res.status(404).json({ error: "Cart is empty" });
    }

    // Prepare cart content
    let cartContent = cartItems
      .map(
        (item) =>
          `${item.product.name} - ${item.quantity} x $${item.product.price}`
      )
      .join("\n");

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Your Cart Details - RSN TeleMart",
      text: `Hello ${user.username},\n\nHere are your cart details:\n\n${cartContent}\n\nThank you for shopping with RSN TeleMart!`,
    });

    // ✅ Clear cart after sending email
    await prisma.cart.deleteMany({
      where: { userId: req.session.userId },
    });

    res.json({ message: "Cart sent to email and cleared successfully" });
  } catch (err) {
    console.error("❌ Error sending email:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});



// Start server
app.listen(3000, () => {
  console.log("🚀 Server is Running at http://localhost:3000");
});
