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
const HiddenGem = require("./model/HiddenGems.js");
const moment = require("moment-timezone");
const { z, ZodError } = require("zod");
const { sheets, SHEET_ID } = require("./sheetClient.js");
const bodyParser = require("body-parser");
const fs = require("fs/promises");
const path = require("path");

const filePathShorts = path.resolve(
  __dirname,
  "..",
  "ht",
  "src",
  "data",
  "blogs.json"
);

const filePathTreks = path.resolve(
  __dirname,
  "..",
  "ht",
  "src",
  "data",
  "hiddenGems.json"
);

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
  zipCode: z.string(),
});

app.post("/send-message", async (req, res) => {
  try {
    const body = contactFormSchema.parse(req.body);

    // Object to Sheets
    const rows = Object.values(body);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Data!A:D",
      insertDataOption: "INSERT_ROWS",
      valueInputOption: "RAW",
      requestBody: {
        values: [rows],
      },
    });
    res.json({ message: "Data added successfully" });
  } catch (error) {
    if (error) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(400).json({ error });
    }
  }
});

app.post("/registerUser", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation checks
    if (!name || !email || !password) {
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
      email,
    });

    await user.save();
    return res.json({ msg: "Registration successful." });
  } catch (err) {
    console.error("Error during registration:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/updateProfile", async (req, res) => {
  try {
    const { email, ...updatedFields } = req.body;

    // Validation checks (customize as needed)
    if (!email) {
      return res.status(422).json({ error: "Email is required." });
    }

    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    for (const [key, value] of Object.entries(updatedFields)) {
      if (key === "pastTreks" || key === "medicalHistory") {
        // Assuming both pastTreks and medicalHistory are arrays
        user[key] = [...value];
      } else {
        user[key] = value;
      }
    }

    await user.save();

    return res.json({ msg: "Profile updated successfully." });
  } catch (err) {
    console.error("Error during profile update:", err);
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
    const { title, description, location, imgSrc } = req.body;

    // Read existing data from the JSON file
    let existingData;
    try {
      existingData = await fs.readFile(filePathShorts, "utf8");
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
      imgSrc,
    };
    shorts.push(newShort);

    // Write the updated data back to the file
    await fs.writeFile(filePathShorts, JSON.stringify(shorts, null, 2), "utf8");

    res.status(200).json({ message: "Short added successfully!" });
  } catch (error) {
    console.error("Error adding short:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/addTrek", async (req, res) => {
  try {
    const { title, description, location, imgSrc, email } = req.body;

    // Create a new HiddenGem instance using the schema
    const newHiddenGem = new HiddenGem({
      title,
      description,
      location,
      imgSrc,
      likeCount: 0,
      dislikeCount: 0,
      postedBy: email, // Replace with the actual user or some identifier
    });

    // Save the new HiddenGem to the database
    const savedHiddenGem = await newHiddenGem.save();

    res
      .status(200)
      .json({ message: "Trek added successfully!", data: savedHiddenGem });
  } catch (error) {
    console.error("Error adding trek:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Fetch all hidden gems
app.get("/getAllHiddenGems", async (req, res) => {
  try {
    const hiddenGems = await HiddenGem.find({});
    res.status(200).json({ data: hiddenGems });
  } catch (error) {
    console.error("Error fetching hidden gems:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// app.post('/likeHiddenGem/:gemId', async (req, res) => {

//   const userId = req.body.id; // Assuming you have user information in req.user

// console.log(userId);
//   try {
//     const hiddenGem = await HiddenGem.findById(req.params.gemId);

//     if (!hiddenGem) {
//       return res.status(404).json({ error: 'Hidden gem not found' });
//     }

//     // Check if the user has already disliked the gem
//     if (hiddenGem.dislikedBy.includes(userId)) {
//       // Remove user from dislikedBy array
//       hiddenGem.dislikedBy = hiddenGem.dislikedBy.filter((id) => id.toString() !== userId);
//       hiddenGem.dislikeCount--;
//     }

//     // Check if the user has already liked the gem
//     if (!hiddenGem.likedBy.includes(userId)) {
//       // Add user to likedBy array
//       hiddenGem.likedBy.push(userId);
//       hiddenGem.likeCount++;
//     }

//     await hiddenGem.save();

//     res.status(200).json({ message: 'Gem liked successfully', gem: hiddenGem });
//   } catch (error) {
//     console.error('Error liking hidden gem:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });


const handleLikeDislike = async (req, res, action) => {
  const userId = req.body.id; // Assuming you have user information in req.user

  try {
    const hiddenGem = await HiddenGem.findById(req.params.gemId);

    if (!hiddenGem) {
      return res.status(404).json({ error: 'Hidden gem not found' });
    }

    // Check if the user has already disliked or liked the gem
    if (action === 'like' && hiddenGem.likedBy.includes(userId)) {
      return res.status(400).json({ error: 'User already liked this gem' });
    } else if (action === 'dislike' && hiddenGem.dislikedBy.includes(userId)) {
      return res.status(400).json({ error: 'User already disliked this gem' });
    }
// Update like and dislike counts based on the action
if (action === 'like') {
  hiddenGem.likedBy.push(userId);
  hiddenGem.likeCount++;
  
  // If user was in dislikedBy, decrement dislikeCount
  if (hiddenGem.dislikedBy.includes(userId)) {
    hiddenGem.dislikedBy = hiddenGem.dislikedBy.filter((id) => id.toString() !== userId);
    hiddenGem.dislikeCount--;
  }
} else if (action === 'dislike') {
  hiddenGem.dislikedBy.push(userId);
  hiddenGem.dislikeCount++;

  // If user was in likedBy, decrement likeCount
  if (hiddenGem.likedBy.includes(userId)) {
    hiddenGem.likedBy = hiddenGem.likedBy.filter((id) => id.toString() !== userId);
    hiddenGem.likeCount--;
  }
}
    await hiddenGem.save();

    res.status(200).json({ message: `Gem ${action}d successfully`, gem: hiddenGem });
  } catch (error) {
    console.error(`Error ${action}ing hidden gem:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

app.post('/likeHiddenGem/:gemId', async (req, res) => {
  handleLikeDislike(req, res, 'like');
});

app.post('/dislikeHiddenGem/:gemId', async (req, res) => {
  handleLikeDislike(req, res, 'dislike');
});



app.get("/getinfo", auth, (req, res) => {
  res.send(req.rootUser);
});

app.get("/logout", (req, res) => {
  res.clearCookie("jwtoken");
  res.status(200).send("User logout");
});

app.listen(PORT, console.log("listening", PORT));
