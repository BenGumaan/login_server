require('dotenv').config();
// console.log("TEST: ",require('dotenv').config())
const mongoose = require('mongoose');
console.log("CONNECT", process.env.MONGODB_URI)
mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log("DB Connected");
}).catch((err) => console.log(err));
