require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const auth = require("./middleware/authenticate");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const User = require("./model/Schema");
const Query = require("./model/Query");
const moment = require("moment-timezone");
const { z, ZodError } = require('zod');
const { sheets, SHEET_ID } = require('./sheetClient.js');
const bodyParser = require("body-parser");
const fs = require("fs/promises");
const path = require('path');


const filePath = path.resolve(__dirname, '..', 'ht','src', 'data', 'blogs.json');

const corsOptions = {
  origin: true,
  credentials: true,
};

app.use(bodyParser.json());
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 8000;
const BASE_URL = process.env.BASE_URL;

const connectionParams = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};
mongoose.set("strictQuery", false);
try {
  mongoose.connect(process.env.MONGO_URI, connectionParams);
  console.log("Database connected succesfully");
} catch (error) {
  console.log(error);
  console.log("Database connection failed");
}
const contactFormSchema = z.object({
  fullName: z.string(),
  address: z.string(),
  city: z.string(),
  zipCode:z.string()

});

app.post("/send-message", async (req, res) => {
  try {
    const body = contactFormSchema.parse(req.body);

    // Object to Sheets
    const rows = Object.values(body);
    

    await sheets.spreadsheets.values.append({
      spreadsheetId:
      SHEET_ID,
      range: "Data!A:D",
      insertDataOption: "INSERT_ROWS",
      valueInputOption: "RAW",
      requestBody: {
        values: [rows],
      },
    });
    res.json({ message: "Data added successfully" });
  } catch (error) {
    if (error ) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(400).json({ error });
    }
  }
});

app.post("/registerUser", async (req, res) => {
  try {
    const { name, phone, email, password, address } = req.body;

    // Validation checks
    if (!name || !phone || !email || !password || !address) {
      return res
        .status(422)
        .json({ error: "Please fill all fields properly." });
    }

    // Password complexity validation (customize as needed)
    if (password.length < 6) {
      return res
        .status(422)
        .json({ error: "Password must be at least 6 characters long." });
    }

    // Check if the email already exists
    const userExist = await User.findOne({ email });
    if (userExist) {
      return res.status(422).json({ error: "Email already exists." });
    }

    // Create and save the user
    const user = new User({
      name,
      password,
      phone,
      address,
      email,
    });
    console.log(user);

    await user.save();
    return res.json({ msg: "Registration successful." });
  } catch (err) {
    console.error("Error during registration:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/login", async (req, res) => {
  //  LOGIN
  let token;
  try {
    const { email, password } = req.body;
    if (!email && !password) {
      return res.status(400).json({ msg: "NaN" });
    }
    const userLogin = await User.findOne({ email: email });

    if (userLogin) {
      const isMatch = await bcrypt.compare(password, userLogin.password);
      token = await userLogin.generateAuthToken();

      res.cookie("jwtoken", token, {
        sameSite: "none",
        secure: true,
        expires: new Date(Date.now() + 25892000000),
        httpOnly: false,
      });

      if (!isMatch) {
        res.status(400).json({ msg: "error" });
      } else {
        res.json({ msg: "success" });
      }
    } else {
      res.status(400).json({ msg: "error" });
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/postQuery", async (req, res) => {
  // POST QUERYYYY
  const { email, content, author } = req.body;

  try {
    // Create a new Query document
    const newQuery = new Query({
      email,
      author,
      content,
      timestamp: new Date(),
    });

    const savedQuery = await newQuery.save();

    res.status(201).json(savedQuery);
  } catch (error) {
    console.error("Error posting query:", error);
    res.status(500).json({ error: "Error posting query" });
  }
});

app.get("/queries", auth, async (req, res) => {
  const { userEmail } = req;

  try {
    if (!userEmail) {
      return res
        .status(401)
        .json({ error: "Unauthorized: No email found in token" });
    }

    // Find all queries associated with the user's email
    const queries = await Query.find({ email: userEmail }).sort({
      timestamp: -1,
    });

    res.json(queries);
  } catch (error) {
    console.error("Error fetching queries by email:", error);
    res.status(500).json({ error: "Error fetching queries by email" });
  }
});

app.get("/allQueries", auth, async (req, res) => {
  try {
    // Find all queries
    const queries = await Query.find().sort({ timestamp: -1 });

    res.json(queries);
  } catch (error) {
    console.error("Error fetching all queries:", error);
    res.status(500).json({ error: "Error fetching all queries" });
  }
});

app.post("/postComment", auth, async (req, res) => {
  const { userName } = req;
  const { userEmail } = req;
  const { comment } = req.body;
  const { id } = req.body;

  try {
    if (!userEmail) {
      return res
        .status(401)
        .json({ error: "Unauthorized: No email found in token" });
    }

    // Find the query by its ID
    const query = await Query.findOne({ _id: id });

    if (!query) {
      return res.status(404).json({ error: "Query not found" });
    }
    // console.log(query);
    // Append the new comment to the comments array
    const newComment = {
      author: userName,
      comment,
    };
    query.comments.push(newComment);

    // Save the updated query with the new comment
    const updatedQuery = await query.save();

    res.json(updatedQuery);
  } catch (error) {
    console.error("Error posting comment:", error);
    res.status(500).json({ error: "Error posting comment" });
  }
});


app.post("/addShort", async (req, res) => {
  try {
    const { title, description, location,imgSrc } = req.body;

    // Read existing data from the JSON file
    let existingData;
    try {
      existingData = await fs.readFile(filePath, "utf8");
    } catch (error) {
      // If the file doesn't exist or is empty, initialize shorts as an empty array
      existingData = "[]";
    }

    let shorts = JSON.parse(existingData);

    // If shorts is not an array, initialize it as an empty array
    if (!Array.isArray(shorts)) {
      shorts = [];
    }

    // Add the new short
    const newShort = {
      title,
      description,
      location,
      imgSrc
    };
    shorts.push(newShort);

    // Write the updated data back to the file
    await fs.writeFile(filePath, JSON.stringify(shorts, null, 2), "utf8");

    res.status(200).json({ message: "Short added successfully!" });
  } catch (error) {
    console.error("Error adding short:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/getinfo", auth, (req, res) => {
  res.send(req.rootUser);
});

app.get("/logout", (req, res) => {
  res.clearCookie("jwtoken");
  res.status(200).send("User logout");
});

app.listen(PORT, console.log("listening", PORT));
