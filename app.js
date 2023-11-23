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

const corsOptions = {
  origin: true,
  credentials: true,
};

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

app.post("/addReview", async (req, res) => {
  const { tutorEmail, userEmail, reviewText } = req.body;
  // console.log(tutorEmail,userEmail,reviewText);
  try {
    // Find the tutor by email
    const tutor = await User2.findOne({ email: tutorEmail });

    if (!tutor) {
      return res.status(404).json({ error: "Tutor not found" });
    }

    // Add the review to the tutor's data
    tutor.testimonials.push({ email: userEmail, test: reviewText });
    await tutor.save();

    // Find the user by email
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Add the review to the user's data
    user.testimonials.push({ email: tutorEmail, test: reviewText });
    await user.save();

    return res.status(200).json({ message: "Review added successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/request", async (req, res) => {
  const { firstName, email, itemEmail } = req.body;

  const mentor = await User2.findOne({ email: itemEmail });

  if (!mentor) {
    return res.status(404).json({ msg: "Mentor not found" });
  }

  // Check if the student already exists in the mentor's students array
  const studentExists = mentor.students.some(
    (student) => student.email === email
  );

  if (studentExists) {
    return res
      .status(400)
      .json({ msg: "You have already sent a request to this mentor" });
  }

  // If the student is not already in the students array, push them.
  mentor.students.push({ name: firstName, email });

  // Save the updated mentor document
  mentor
    .save()
    .then(() => {
      res.json({ msg: "Success" });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ msg: "Internal Server Error" });
    });
});

app.post("/deleteReq", async (req, res) => {
  const { email, name } = req.body;

  User.find({
    role: "Mentor",
    "mentors.email": email,
  }).then((data) => {
    if (data) {
      data.map((val) => {
        User.findOneAndUpdate(
          { email: val.email },
          { $pull: { mentors: { name, email } } },
          { new: true }
        ).then((dat) => {});
      });
    }
  });

  res.json({ msg: "success" });
});

app.post("/decline", async (req, res) => {
  const { email, userEmail } = req.body;
  console.log(userEmail);
  const ans = await User.findOneAndUpdate(
    { email: email },
    { $pull: { students: { email: userEmail } } },
    { new: true }
  );
  res.json({ msg: "success" });
});

app.get("/findProfileTutor", (req, res) => {
  const { email } = req.query;

  // Find the tutor profile by email using the User2 model
  User2.findOne({ email }, (err, tutorProfile) => {
    if (err) {
      console.error("Error fetching tutor profile:", err);
      res.status(500).json({ error: "Internal server error" });
    } else if (!tutorProfile) {
      res.status(404).json({ error: "Tutor not found" });
    } else {
      res.json(tutorProfile);
    }
  });
});

app.get("/getAllTutors", (req, res) => {
  // Use the find method to retrieve all tutors nfrom the database
  User2.find({}, (err, tutors) => {
    if (err) {
      console.error("Error fetching tutors:", err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.json(tutors);
    }
  });
});

app.get("/getReviewsByTutorEmail", async (req, res) => {
  const { email } = req.query;

  try {
    const tutor = await User2.findOne({ email });

    if (!tutor) {
      return res.status(404).json({ message: "Tutor not found" });
    }

    // Assuming reviews are stored as an array in the tutor document
    const reviews = tutor.testimonials || [];
    res.status(200).json(reviews);
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(500).json({ message: "Internal server error" });
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
