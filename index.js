const express = require("express");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

// Middleware to parse JSON
app.use(express.json());

// Test route
app.post("/newuser", async(req, res) => {
  const data=req.body;
  const {username,password,name,email,phoneNumber}=data;
  const Newuser=await prisma.userDetails.create({
    data:{
      username,
      password,
      name,
      email,
      phoneNumber
    }
  });
  res.send({message:"details send"})
});

// Start server
app.listen(3000, () => {
  console.log("🚀 Server is Running at http://localhost:3000");
});
