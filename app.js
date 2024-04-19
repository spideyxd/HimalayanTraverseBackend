require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const auth = require("./middleware/authenticate");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");

const User = require("./model/Schema");
const FindingBuddy = require("./model/FindingBuddy");
const Query = require("./model/Query");
const Message = require("./model/Message");
const HiddenGem = require("./model/HiddenGems.js");

const moment = require("moment-timezone");
const { z, ZodError } = require("zod");
const { sheets, SHEET_ID } = require("./sheetClient.js");
const bodyParser = require("body-parser");
const fs = require("fs/promises");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { appendFile } = require("fs");
const { log } = require("console");

const filePathShorts = path.resolve(
  __dirname,
  "..",
  "ht",
  "src",
  "data",
  "blogs.json"
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

const server = http.createServer(app);

const contactFormSchema = z.object({
  fullName: z.string(),
  address: z.string(),
  city: z.string(),
  zipCode: z.string(),
  quantity: z.number(), // Assuming quantity is a number
  rentalDays: z.number(), // Assuming days is a number
  currentDate: z.string(), // Assuming currentDate is a string (e.g., date in a specific format)
});

// SOCKET APIS

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("join_room", (data) => {
    socket.join(data);
  });

  socket.on("login", async (userId) => {
    try {
      // Find the user in the database
      const user = await User.findById(userId);
      if (!user) {
        console.error("User not found");
        return;
      }

      // Update the user's socket ID
      user.SocketId = socket.id;
      await user.save();

      console.log("Socket ID associated with user:", socket.id);
    } catch (error) {
      console.error("Error associating socket ID with user:", error);
    }
  });
  // Store the socket ID in the corresponding FindBuddy document
  socket.on("store_socket_id", (authorEmail) => {
    FindingBuddy.findOneAndUpdate(
      { email: authorEmail }, // Assuming email uniquely identifies the FindBuddy document
      { authorSocketId: socket.id }, // Update the authorSocketId field with the socket ID
      { new: true }
    )
      .then((findBuddy) => {
        console.log("Socket ID stored for author");
      })
      .catch((error) => {
        console.error("Error storing socket ID:", error);
      });
  });

  socket.on("message", async (messageData) => {
    try {
      // Find the sender and recipient users in the database
      const sender = await User.findById(messageData.senderId);
      const recipient = await User.findById(messageData.recipientId);

      if (!sender || !recipient) {
        // If either the sender or recipient is not found, log an error and return
        console.error("Sender or recipient not found");
        return;
      }

      // Create a message object using the message schema
      const newMessage = {
        senderId: sender._id, // Set the sender ID
        name:sender.name ,
        content: messageData.content, // Set the message content
        timestamp: new Date(), // Set the current timestamp
        read: false, // Initially mark the message as unread
      };

      let conversation = sender.conversations.find((conversation) =>
        conversation.participantId.equals(recipient._id)
      );

      if (!conversation) {
        // If no conversation exists, create a new one
        conversation = {
          participantId: recipient._id,
          name:recipient.name, // Set the participant ID to the sender's ID
          messages: [], // Initialize an empty array of messages
        };
        sender.conversations.push(conversation); // Add the new conversation to the recipient's conversations array
      }

      // Add the new message to the conversation's messages array
      conversation.messages.push(newMessage);

      // Save the updated recipient user document
      await sender.save();

      // Optionally, you can emit the message back to the sender and recipient
      io.to(sender.SocketId).emit("message", newMessage);
      io.to(recipient.SocketId).emit("message", newMessage);

      console.log("Message saved successfully");
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });
});

// NON SOCKET APIS

app.post("/send-message", async (req, res) => {
  try {
    const body = contactFormSchema.parse(req.body);

    // Object to Sheets
    const rows = Object.values(body);
    // console.log(body);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Data!A:F",
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

app.post("/Googlelogin", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ msg: "Email is required" });
    }

    const userLogin = await User.findOne({ email: email });

    if (userLogin) {
      // Generate and set the token
      const token = await userLogin.generateAuthToken();

      // Set the token in the cookie
      res.cookie("jwtoken", token, {
        sameSite: "none",
        secure: true,
        expires: new Date(Date.now() + 25892000000),
        httpOnly: false,
      });

      // Return success
      res.json({ msg: "success" });
    } else {
      // Return error if email is not found
      res.status(400).json({ msg: "error" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server Error" });
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

app.post("/postFindingBuddy", async (req, res) => {
  // POST QUERYYYY
  const { email, content, author } = req.body;

  try {
    // Create a new Query document
    const newQuery = new FindingBuddy({
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

app.post("/addInterestedUser", async (req, res) => {
  try {
    const { queryEmail, userData } = req.body;
    if (queryEmail == userData.email) return;

    // Find the corresponding FindBuddy document and update the interestedUsers array
    const findBuddy = await FindingBuddy.findOneAndUpdate(
      { email: queryEmail }, // Assuming email uniquely identifies the FindBuddy document
      { $addToSet: { interestedUsers: userData._id } }, // Add user ID to interestedUsers array if not already present

      { new: true }
    );

    const existingNotification = await User.findOne({
      email: findBuddy.email,
      "notifications.type": "interest",
      "notifications.id": userData._id, // Use userData._id as the ID
    });

    if (!existingNotification) {
      await User.findOneAndUpdate(
        { email: findBuddy.email },
        {
          $push: {
            notifications: {
              id: userData._id, // Use userData._id as the ID
              name: userData.name,
              type: "interest",
              message: `${userData.name} is interested in your FindBuddy query`,
              createdAt: new Date(),
              read: false,
            },
          },
        },
        { new: true }
      );
      if (findBuddy.authorSocketId) {
        // Send a notification to the user who posted the query
        // console.log(findBuddy.authorSocketId);
        io.to(findBuddy.authorSocketId).emit("notification", {
          type: "interest",
          message: `${userData.name} is interested in your Travel Plans, Please click on Notification Icon`,
        });
      }

      res.status(200);
    } else {
      // Notification already exists, send error message to frontend
      res
        .status(400)
        .json({ message: "You've already shown interest in this query." });
    }

    if (!findBuddy) {
      return res.status(404).json({ message: "FindBuddy post not found" });
    }

    // Check if the user who posted the query is online
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/addNotificationAsConversation/:notificationId", async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { user } = req.body;

    // Find the users based on the provided user data

    const user_email = await User.findOne({ email: user.email });
    const notificationUser = await User.findById(notificationId);

    if (!user_email || !notificationUser) {
      return res
        .status(404)
        .json({ message: "User or notification not found" });
    }

    // Check if the conversation already exists for both users
    const userConversationExists = user_email.conversations.some(
      (conversation) =>
        conversation.participantId.toString() ===
        notificationUser._id.toString()
    );
    const notificationUserConversationExists =
      notificationUser.conversations.some(
        (conversation) =>
          conversation.participantId.toString() === user_email._id.toString()
      );

    if (!userConversationExists) {
      // Create a new conversation object for the user
      const newConversationForUser = {
        participantId: notificationUser._id,
        name:notificationUser.name,
        messages: [],
      };

      // Add the new conversation to the user's conversations array
      user_email.conversations.push(newConversationForUser);
    }

    if (!notificationUserConversationExists) {
      // Create a new conversation object for the notification user
      const newConversationForNotificationUser = {
        participantId: user_email._id,
        name:user_email.name,
        messages: [],
      };

      // Add the new conversation to the notification user's conversations array
      notificationUser.conversations.push(newConversationForNotificationUser);
    }

    console.log(user_email);
    console.log(notificationUser);
    // Save the updated user documents
    await user_email.save();
    await notificationUser.save();

    res.status(200).json({ message: "Conversation IDs added to both users" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/messages", async (req, res) => {
  try {
    // Extract user IDs from the request body
    const { currentUserId, otherUserId } = req.body;

    // Fetch messages from the database based on the user IDs
    const currentUser = await User.findOne({
      _id: currentUserId,
      "conversations.participantId": otherUserId,
    })
      .select("conversations")
      .lean();

    const otherUser = await User.findOne({
      _id: otherUserId,
      "conversations.participantId": currentUserId,
    })
      .select("conversations")
      .lean();

    // Extract and merge messages from both users' conversations
    const currentUserMessages = currentUser
    ? currentUser.conversations.find((conv) =>
        conv.participantId.equals(otherUserId)
      )?.messages || []
    : [];
  
  const otherUserMessages = otherUser
    ? otherUser.conversations.find((conv) =>
        conv.participantId.equals(currentUserId)
      )?.messages || []
    : [];
  

    const allMessages = [...currentUserMessages, ...otherUserMessages];

    // Sort messages by timestamp in ascending order
    const sortedMessages = allMessages.sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // Return the fetched messages
    res.status(200).json(sortedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/allFindingBuddyQueries", auth, async (req, res) => {
  try {
    // Find all queries
    const queries = await FindingBuddy.find().sort({ timestamp: -1 });

    res.json(queries);
  } catch (error) {
    console.error("Error fetching all queries:", error);
    res.status(500).json({ error: "Error fetching all queries" });
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

const handleLikeDislike = async (req, res, action) => {
  const userId = req.body.id; // Assuming you have user information in req.user

  try {
    const hiddenGem = await HiddenGem.findById(req.params.gemId);

    if (!hiddenGem) {
      return res.status(404).json({ error: "Hidden gem not found" });
    }

    // Check if the user has already disliked or liked the gem
    if (action === "like" && hiddenGem.likedBy.includes(userId)) {
      return res.status(400).json({ error: "User already liked this gem" });
    } else if (action === "dislike" && hiddenGem.dislikedBy.includes(userId)) {
      return res.status(400).json({ error: "User already disliked this gem" });
    }
    // Update like and dislike counts based on the action
    if (action === "like") {
      hiddenGem.likedBy.push(userId);
      hiddenGem.likeCount++;

      // If user was in dislikedBy, decrement dislikeCount
      if (hiddenGem.dislikedBy.includes(userId)) {
        hiddenGem.dislikedBy = hiddenGem.dislikedBy.filter(
          (id) => id.toString() !== userId
        );
        hiddenGem.dislikeCount--;
      }
    } else if (action === "dislike") {
      hiddenGem.dislikedBy.push(userId);
      hiddenGem.dislikeCount++;

      // If user was in likedBy, decrement likeCount
      if (hiddenGem.likedBy.includes(userId)) {
        hiddenGem.likedBy = hiddenGem.likedBy.filter(
          (id) => id.toString() !== userId
        );
        hiddenGem.likeCount--;
      }
    }
    await hiddenGem.save();

    res
      .status(200)
      .json({ message: `Gem ${action}d successfully`, gem: hiddenGem });
  } catch (error) {
    console.error(`Error ${action}ing hidden gem:`, error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

app.post("/likeHiddenGem/:gemId", async (req, res) => {
  handleLikeDislike(req, res, "like");
});

app.post("/dislikeHiddenGem/:gemId", async (req, res) => {
  handleLikeDislike(req, res, "dislike");
});

app.get("/getinfo", auth, (req, res) => {
  res.send(req.rootUser);
});

app.get("/logout", (req, res) => {
  res.clearCookie("jwtoken");
  res.status(200).send("User logout");
});

server.listen(PORT, console.log("listening", PORT));
