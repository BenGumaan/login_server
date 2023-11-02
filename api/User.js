const express = require('express');
const router = express.Router();

// mongodb user model
const User = require('./../models/User');

// mongodb User verification model
const UserVerification = require('./../models/UserVerification');

// email handler
const nodemailer = require('nodemailer');

// unique string
const {v4: uuidv4} = require('uuid');

// env variable
require('dotenv').config();

// Password handler 
const bcrypt = require('bcrypt');

// path for static verified page
const path = require("path");

// nodemailer stuff
let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    service: "gmail",
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
    }
})

// testing success
transporter.verify((error, success) => {
    if (error) {
        console.log(error);
    } else {
        console.log("Ready for message");
        console.log(success);
    }
});

// Signup
router.post('/signup', (req, res) => {
    let {name, email, password, dateOfBirth} = req.body;
    name = name.trim();
    email = email.trim();
    password = password.trim();
    dateOfBirth = dateOfBirth.trim();

    if (name == "" || email == "" || password == "" || dateOfBirth == "" ) {
        res.json({
            status: "FAILED",
            message: "Empty input fields!"
        });
    } else if (!/^[a-zA-Z ]*$/.test(name)) {
        res.json({
            status: "FAILED",
            message: "Invalid name entered"
        });
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        res.json({
            status: "FAILED",
            message: "Invalid email entered"
        });
    } else if (!new Date(dateOfBirth).getTime()) {
        res.json({
            status: "FAILED",
            message: "Invalid date of birth entered"
        });
    } else if (password.length < 8) {
        res.json({
            status: "FAILED",
            message: "Password is too short!"
        });
    } else {
        // Check if user already exists
        User.find({email})
        .then(result => {
            if (result.length) {
                // A user already exists
                res.json({
                    status: "FAILED",
                    message: "User with the provided email already exists"
                })
            } else {
                // Try to create a new user

                // Password handling
                const saltRounds = 10;
                bcrypt.hash(password, saltRounds).then(hashedPassword => {
                    const newUser = new User({
                        name,
                        email,
                        password: hashedPassword,
                        dateOfBirth,
                        verified: false
                    });

                    newUser.save().then(result => {
                        // handle account verification
                        sendVerificationEmail(result, res);

                        // res.json({
                        //     status: "SUCCESS",
                        //     message: "Signup successful",
                        //     data: result
                        // })
                    }).catch(err => {
                        res.json({
                            status: "FAILED",
                            message: "An error occured while saving user account!"
                        })
                    })
                }).catch(err => {
                    res.json({
                        status: "FAILED",
                        message: "An error occured while hashing password!"
                    })
                })
            }
        }).catch(err => {
            console.log(err);
            res.json({
                status: "FAILED",
                message: "An error occurred while checking for existing user!"
            })
        });
    }
})

// send verification email
const sendVerificationEmail = ({_id, email}, res) => {
    // url to be used in the email
    const currentUrl = "http://localhost:5000/";

    const uniqueString = uuidv4() + _id;

    // mail options | composing email
    const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Verify Your Email",
        html: `<p>Verify your email address to complete the signup and login into your account.</p><p>This link <b>expires in 6 hours</b>.</p>
        <p>Press <a href=${currentUrl + 'user/verify/' + _id + "/" + uniqueString}>here</a> to proceed.</p>`
    };

    // hash the uniqueString
    const saltRounds = 10;
    bcrypt
    .hash(uniqueString, saltRounds)
    .then((hashedUniqueString) => {
        // set values in userVerification collection
        const newVerification = new UserVerification({
            userId: _id,
            uniqueString: hashedUniqueString,
            createdAt: Date.now(),
            expiresAt: Date.now() + 21600000
        });

        newVerification
        .save()
        .then(() => {
            transporter.sendMail(mailOptions).then(() => {
                // email sent and verification record saved
                res.json({
                    status: "PENDING",
                    message: "Verification email sent"
                })
            }).catch((error) => {
                console.log(error);
                res.json({
                    status: "FAILED",
                    message: "Verification email failed!"
                })
            });
        })
        .catch((error) => {
            console.log(error);
            res.json({
                status: "FAILED",
                message: "Couldn't save verification email data!"
            })
        });
    })
    .catch(() => {
        res.json({
            status: "FAILED",
            message: "An error occured while hashing email data!"
        })
    });
};

// verify email
router.get("/verify/:userId/:uniqueString", (req, res) => {
    /*
    Example:
    req.params:  {
        userId: '6543b9e9a569b0b7b9f06498',
        uniqueString: 'a6a79f23-5940-4fa4-9501-a06faa8d0b286543b9e9a569b0b7b9f06498'
    }
    */
    let { userId, uniqueString } = req.params;
    /*
        Error:  ObjectParameterError: Parameter "filter" to find() must be an object, got "6543b9e9a569b0b7b9f06498" (type string)
        Solution: put the variable inside {} to make it an object
        Example: UserVerification.find(userId) => UserVerification.find({userId}) | UserVerification.find({userId: req.params.userId})

    */
    UserVerification
    .find({userId})
    .then((result) => {
        console.log("result: ", result);
        if (result.length > 0) {
            // user verification record exists so we process

            const {expiresAt} = result[0]; // {expiresAt} will give you the value of the key "expiresAt" from the object {result}
            const hashedUniqueString = result[0].uniqueString;
            // console.log("expiresAt: ", {expiresAt});
            // checking for expired unique string
            if (expiresAt < Date.now()) {
                // record has expired so we delete it
                UserVerification.deleteOne({userId})
                .then(result => {
                    User.deleteOne({_id: userId})
                    .then(() => {
                        let message = "Link has expired. Please sign up again.";
                        res.redirect(`/user/verified/error=true&message=${message}`);                
                    })
                    .catch((error) => {
                        let message = "Clearing user with expired unique string failed";
                        res.redirect(`/user/verified/error=true&message=${message}`);                
                    });
                })
                .catch((error) => {
                    console.log(error);
                    let message = "An error occured while clearing expired user verification record";
                    res.redirect(`/user/verified/error=true&message=${message}`);            
                });
            } else {
                // valid record exists so we validate the user string
                // first compare the hashed unique string

                bcrypt.compare(uniqueString, hashedUniqueString)
                .then(result => {
                    if (result) {
                        // strings match

                        User.updateOne({_id: userId}, {verified: true})
                        .then(() => {
                            UserVerification.deleteOne({userId})
                            .then(() => {
                                res.sendFile(path.join(__dirname, "./../views/verified.html"));
                            })
                            .catch(error => {
                                console.log(error);
                                let message = "An error occured while finalizing successful verification.";
                                res.redirect(`/user/verified/error=true&message=${message}`);                
                            });
                        })
                        .catch(error => {
                            console.log(error);
                            let message = "An error occured while updating user record to show verified";
                            res.redirect(`/user/verified/error=true&message=${message}`);            
                        });

                    } else {
                        // existing record but incorrect verification details passed.
                        let message = "Invalid verificaiton details passed. Check your inbox.";
                        res.redirect(`/user/verified/error=true&message=${message}`);
                    }
                })
                .catch(error => {
                    console.log(error);
                    let message = "An error occured while comparing unique strings.";
                    res.redirect(`/user/verified/error=true&message=${message}`);            
                });
            }
        } else {
            // user verification record doesn't exist 
            let message = "Account record doesn't exist or has been verified already. Please sign up or log in.";
            res.redirect(`/user/verified/error=true&message=${message}`);    
        }

        // let message = "An error occured while checking for existing user verification record";
        // res.redirect(`/user/verified/error=true&message=${message}`);
    })
    .catch((error) => {
        console.log("error: ", error);
        let message = "An error occured while checking for existing user verification record";
        res.redirect(`/user/verified/error=true&message=${message}`);
    });
});

// verified page route
router.get("/verified", (req, res) => {
    res.sendFile(path.join(__dirname, "./../views/verified.html"))
});


// Signin
router.post('/signin', (req, res) => {
    let {email, password} = req.body;
    // console.log("req.body: ", req.body); // req.body => will give you the request that you initiated. (only email & password as you requested)

    email = email.trim();
    password = password.trim();

    if (email == "" || password == "") {
        res.json({
            status: "FAILED",
            message: "Empty credentials supplied"
        })
    } else {
        // Check if user exists
        User.find({email})
        .then((data) => {
            // console.log("data: ", data);
            /**
             data:  [
                {
                    _id: new ObjectId('6543bdf6240af39a0308d4a0'),
                    name: 'ben',
                    email: '00@gmail.com',
                    password: '$2b$10$DVwad9x7JvVs58Wc/94B/.SFWGHV.XsN3dAfx1GvHrtG.VdG51FhG',
                    dateOfBirth: 1990-09-09T22:00:00.000Z,
                    verified: true,
                    __v: 0
                }
            ]
             */
            // console.log("data.length: ", data.length);  // 1

            if (data.length) {
                // User exists

                // check if user is verified

                if (!data[0].verified) {
                    res.json({
                        status: "FAILED",
                        message: "Email has not been verified yet. Check your inbox.",
                    })   

                } else {
                    
                    const hashedPassword = data[0].password;

                    bcrypt.compare(password, hashedPassword) // Compare between them and tell me if they're matched! 
                    .then((result) => {  

                        if (result) {  // if paswords match then the 'result' is true

                            // Password match
                            res.json({
                                status: "SUCCESS",
                                message: "Signin successful",
                                data: data
                            })    
                        } else {
                            res.json({
                                status: "FAILED",
                                message: "Invalid password entered!",
                            })    
                        }
                    }).catch((err) => {
                        res.json({
                            status: "FAILED",
                            message: "An error occured while comparing passwords",
                        })    
                    })     

                }

            } else {
                res.json({
                    status: "FAILED",
                    message: "Invalid credentials entered!",
                })    
            }
        }).catch(err => {
            res.json({
                status: "FAILED",
                message: "An error occured while checking for existing user",
            })    
        })
    }
})

module.exports = router;
