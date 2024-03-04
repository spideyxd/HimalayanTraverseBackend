const jwt = require("jsonwebtoken");

const User = require("../model/Schema");

const Authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.jwtoken || null;
    if (!token) return res.status(401).send("noTokenFound");
    if (token) {

      const verifyToken = jwt.verify(token, process.env.REACT_APP_TOKEN); 

      const rootUser = await User.findOne({
        _id: verifyToken._id,
        "tokens.token": token,
      }).catch((err) => {
        console.error("Error while finding user:", err);
      });

      if (!rootUser) {
        return res.status(401).send("Unauthorized: no token provided");
      }

      req.token = token;
      req.rootUser = rootUser;
      req.userID = rootUser._id;
      req.userEmail = rootUser.email;
      req.userName = rootUser.name;
      next();
    }
  } catch (err) {
    res.status(401).send("Unauthorized: no token provided");
  }
};

module.exports = Authenticate;
