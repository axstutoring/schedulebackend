const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto-js');
const nodemailer = require('nodemailer');
const Dotenv = require("dotenv").config(); //create a .env file containing the passwords if running the code locally
const connection = "mongodb+srv://KevinTang:" + process.env.M_PASSWORD + "@axs-tutoring.c24c5cd.mongodb.net/?retryWrites=true&w=majority";

const tutoringChairs = "Elliot Stack and Parker Powers";

const transporter = nodemailer.createTransport( {
    service: "Zoho",
    auth: {
        user: "axstutoring@zohomail.com",
        pass: process.env.E_PASSWORD
    }
});

const connectDB = async () => {
    mongoose.set('strictQuery', false);

    await mongoose
        .connect (connection)
            .then(() => console.log("Connected to DB"))
            .catch(console.error);
}

const app = express();
app.use(express.json());
app.use(cors());

connectDB().then(() => {
    app.listen(8080, () => {console.log("Server listening on port 8080");});
})

const Post = require("./models/post");
const Course = require("./models/course");
const Request = require("./models/request");
const Email = require("./models/email");

const monthList = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const timeTable = ["8:00 AM", "8:15 AM", "8:30 AM", "8:45 AM", 
"9:00 AM", "9:15 AM", "9:30 AM", "9:45 AM", 
"10:00 AM", "10:15 AM", "10:30 AM", "10:45 AM", 
"11:00 AM", "11:15 AM", "11:30 AM", "11:45 AM", 
"12:00 PM", "12:15 PM", "12:30 PM", "12:45 PM", 
"1:00 PM", "1:15 PM", "1:30 PM", "1:45 PM", 
"2:00 PM", "2:15 PM", "2:30 PM", "2:45 PM", 
"3:00 PM", "3:15 PM", "3:30 PM", "3:45 PM", 
"4:00 PM", "4:15 PM", "4:30 PM", "4:45 PM", 
"5:00 PM", "5:15 PM", "5:30 PM", "5:45 PM", 
"6:00 PM", "6:15 PM", "6:30 PM", "6:45 PM", 
"7:00 PM", "7:15 PM", "7:30 PM", "7:45 PM",
];

function dateEncoder(bookDate)
{
    const weekList = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthListShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    let dateProcessor = "{";
    let comparisonString = bookDate.substr(0, 3);
    for (let j = 0; j < 7; j++)
    {
        if (comparisonString === weekList[j])
        {
            dateProcessor += j.toString();
            break;
        }
    }

    comparisonString = bookDate.substr(19);
    for (let j = 0; j < 48; j++)
    {
        if (comparisonString === timeTable[j])
        {
            if (j < 10)
            {
                dateProcessor += "0";
            }
            dateProcessor += j.toString();
            break;
        }
    }

    dateProcessor += bookDate.substr(11, 4);

    comparisonString = bookDate.substr(4, 3);
    for (let j = 0; j < 12; j++)
    {
        if (comparisonString === monthListShort[j])
        {
            if (j < 9)
            {
                dateProcessor += "0";
            }
            dateProcessor += (j+1).toString();
            break;
        }
    }

    dateProcessor += bookDate.substr(8, 2) + "}";
    return dateProcessor;
}

app.get('/startup', async (req, res) => {
    res.json(0);
})

app.get('/memberid', async (req, res) => {
    const feed = await Post.find( {email: req.query.user} );
    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].email === req.query.user)
        {
            return res.json(feed[i]._id.toString());
        }
    }
    res.json("");
})

app.get('/credentials', async (req, res) => {
    let flag = "";
    const feed = await Post.find( {email: req.query.user} );
    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].email === req.query.user)
        {
            if (crypto.SHA256(req.query.password).toString() === feed[i].password)
            {
                flag = feed[i]._id;
                if (feed[i].authorization === 1)
                {
                    flag = "*";
                }
                break;
            }
        }
    }
    res.json(flag);
})

app.get('/feed/:id', async (req, res) => {
    const courseFeed = await Course.find();
    const feed = await Post.find();
    let subjectList = new Array(feed.length);
    for (let i = 0; i < courseFeed.length; i++)
    {
        subjectList[i] = courseFeed[i].course
    }

    let memberOfInterest = req.params.id;

    let returnObject = new Array(17);

    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i]._id.toString() === memberOfInterest)
        {
            let getSun = new Array(48).fill(false);
            let getMon = new Array(48).fill(false);
            let getTue = new Array(48).fill(false);
            let getWed = new Array(48).fill(false);
            let getThurs = new Array(48).fill(false);
            let getFri = new Array(48).fill(false);
            let getSat = new Array(48).fill(false);
            let getSubject = new Array(subjectList.length).fill(false);

            //setId(response.data[i]._id.toString());
            //setMemberEmail(response.data[i].email);
            //setMemberPhone(response.data[i].phone);
            //setMaximumHours(response.data[i].maximumHours);
            for (let j = 0; j < feed[i].subject.length; j++)
            {
                let buildSubject = "";
                if (feed[i].subject[j] === "{")
                {
                    j++;
                    while (feed[i].subject[j] !== "}")
                    {
                        buildSubject += feed[i].subject[j];
                        j++;
                    }
                    for (let k = 0; k < subjectList.length; k++)
                    {
                        if (subjectList[k] === buildSubject)
                        {
                            getSubject[k] = true;
                            buildSubject = "";
                            break;
                        }
                    }
                }
            }

            //setSubject(getSubject);
            for (let j = 0; j < feed[i].availability.length; j+=3)
            {
                switch (feed[i].availability[j])
                {
                    case "0":
                        getSun[Number(feed[i].availability[j + 1] + feed[i].availability[j + 2])] = true;
                        break
                    case "1":
                        getMon[Number(feed[i].availability[j + 1] + feed[i].availability[j + 2])] = true;
                        break
                    case "2":
                        getTue[Number(feed[i].availability[j + 1] + feed[i].availability[j + 2])] = true;
                        break
                    case "3":
                        getWed[Number(feed[i].availability[j + 1] + feed[i].availability[j + 2])] = true;
                        break
                    case "4":
                        getThurs[Number(feed[i].availability[j + 1] + feed[i].availability[j + 2])] = true;
                        break
                    case "5":
                        getFri[Number(feed[i].availability[j + 1] + feed[i].availability[j + 2])] = true;
                        break
                    case "6":
                        getSat[Number(feed[i].availability[j + 1] + feed[i].availability[j + 2])] = true;
                        break
                    default:
                        break;
                }
            }

            let temp = (new Date(feed[i].off[0])).getMonth() + 1;

            returnObject[0] = feed[i]._id.toString();
            returnObject[1] = feed[i].member;
            returnObject[2] = feed[i].email;
            returnObject[3] = feed[i].phone;
            returnObject[4] = getSubject;
            returnObject[5] = getSun;
            returnObject[6] = getMon;
            returnObject[7] = getTue;
            returnObject[8] = getWed;
            returnObject[9] = getThurs;
            returnObject[10] = getFri;
            returnObject[11] = getSat;
            returnObject[12] = feed[i].maximumHours;
            if (feed[i].off[0] === 0)
            {
                returnObject[13] = 0;
                returnObject[14] = 0;
                returnObject[15] = 0;
                returnObject[16] = 0;
            }
            else
            {
                returnObject[13] = (new Date(feed[i].off[0])).getMonth() + 1;
                returnObject[14] = (new Date(feed[i].off[0])).getDate();
                returnObject[15] = (new Date(feed[i].off[1])).getMonth() + 1;
                returnObject[16] = (new Date(feed[i].off[1])).getDate();
            }
            break;
        }
    }

    res.json(returnObject);
})

app.get('/feed', async (req, res) => {
    const feed = await Post.find();

    res.json(feed);
})

app.get('/courseraw', async (req, res) => {
    const feed = await Course.find();

    res.json(feed);
})

app.post('/course/new', async (req, res) => {
    const post = new Course({
        course: req.body.course,
        subjectDivision: req.body.subjectDivision,
    });
    post.save();
    res.json(post);
})

app.post('/feed/new', async (req, res) => {
    const feed = await Course.find();
    let subjectList = new Array(feed.length);
    for (let i = 0; i < feed.length; i++)
    {
        subjectList[i] = feed[i].course;
    }

    let courseList = "";
    for (let i = 0; i < req.body.subject.length; i++)
    {
        if (req.body.subject[i]){courseList += "{" + subjectList[i]+ "}";}
    }

    let availabilityList = "";
    let placeHolder = "0";
    for (let i = 0; i < 48; i++)
    {
        if (i === 10){placeHolder = "";}
        if (req.body.availabilitySun[i]){availabilityList += "0" + placeHolder + i.toString();}
        if (req.body.availabilityMon[i]){availabilityList += "1" + placeHolder + i.toString();}
        if (req.body.availabilityTue[i]){availabilityList += "2" + placeHolder + i.toString();}
        if (req.body.availabilityWed[i]){availabilityList += "3" + placeHolder + i.toString();}
        if (req.body.availabilityThurs[i]){availabilityList += "4" + placeHolder + i.toString();}
        if (req.body.availabilityFri[i]){availabilityList += "5" + placeHolder + i.toString();}
        if (req.body.availabilitySat[i]){availabilityList += "6" + placeHolder + i.toString();}
    }

    let dateArray = new Array(2).fill(0);
    if (req.body.monthStart !== "" && req.body.dayStart !== "" && req.body.monthEnd !== "" && req.body.dayEnd !== "")
    {
        const currentYear = (new Date()).getFullYear();
        let futureYear = currentYear;
        let monthStartNum = 0;
        let monthEndNum = 0;
        let dayStartNum = req.body.dayStart;
        let dayEndNum = req.body.dayEnd;
        for (let i = 0; i < 13; i++)
        {
            if (req.body.monthStart === monthList[i])
            {
                monthStartNum = i;
            }
            if (req.body.monthEnd === monthList[i])
            {
                monthEndNum = i;
            }
        }

        if ((monthStartNum === 4 || monthStartNum === 6 || monthStartNum === 9 || monthStartNum === 11) && dayStartNum === "31")
        {
            dayStartNum = "30";
        }
        else if (monthStartNum === 2 && dayStartNum > "28")
        {
            if (currentYear % 4 === 0)
            {
                dayStartNum = "29";
            }
            else
            {
                dayStartNum = "28";
            }
        }

        if ((monthEndNum === 4 || monthEndNum === 6 || monthEndNum === 9 || monthEndNum === 11) && dayEndNum === "31")
        {
            dayEndNum = "30";
        }
        else if (monthEndNum === 2 && dayEndNum > "28")
        {
            if (futureYear % 4 === 0)
            {
                dayEndNum = "29";
            }
            else
            {
                dayEndNum = "28";
            }
        }
        //console.log(monthEndNum < monthStartNum);
        //console.log((monthEndNum === monthStartNum && Number(req.body.dayEnd) < Number(req.body.dayStart)));
        if (monthEndNum < monthStartNum || (monthEndNum === monthStartNum && Number(dayEndNum) < Number(dayStartNum)))
        {
            futureYear++;
        }

        //console.log(req.body.monthStart + " " + dayStartNum + ", " + currentYear.toString());
        //console.log(req.body.monthEnd + " " + dayEndNum + ", " + futureYear.toString());
        dateArray[0] = Date.parse(req.body.monthStart + " " + dayStartNum + ", " + currentYear.toString());
        dateArray[1] = Date.parse(req.body.monthEnd + " " + dayEndNum + ", " + futureYear.toString());
    }

    let rank = 0;
    if ((crypto.SHA256(req.body.password)).toString() === "73425a523ea7cbcafe010fce61feaa6a6c3352430db4e4d368255aae6165e2cb")
    {
        rank = 1;
    }

    let post = new Post({
        member: req.body.member,
        email: req.body.email,
        phone: req.body.phone,
        subject: courseList,
        availability: availabilityList,
        maximumHours: req.body.maximumHours,
        off: dateArray,
        password: "-",
        authorization: rank,
    });

    await post.save();

    const idString = (post._id).toString();

    if (req.body.notify === '1')
    {
        const message = "Dear " + req.body.member + ",\n\n" + "A tutoring account has been created under the email " + req.body.email +
        ". Your temporary password is " + idString.substring(idString.length - 6, idString.length) + " which can be changed by logging"
        + " into https://axstutoring.github.io/schedule, clicking 'modify schedule', and entering a password at the bottom of the page.\n"
        + "\nSincerely,\n" + tutoringChairs;

        const options = {
            from: "axstutoring@zohomail.com",
            to: req.body.email,
            subject: "AXS Tutoring - Account Creation",
            text: message,
        };
        
        await new Promise((resolve, reject) => {
            transporter.sendMail(options, function (err, info){
                if (err)
                {
                    reject(err);
                }
                else
                {
                    resolve("email sent");
                }
                //console.log("Sent", info.response);
            });
        })
    }

    const post1 = await Post.findByIdAndUpdate(post._id, {
        password: crypto.SHA256(crypto.SHA256(idString.substring(idString.length - 6, idString.length) + idString).toString()).toString(),
    }, { new: true });

    post1.save();

    res.json(post);
})

app.put('/feed/edit/:id', async (req, res) => {
    const feed = await Course.find();
    let subjectList = new Array(feed.length);
    for (let i = 0; i < feed.length; i++)
    {
        subjectList[i] = feed[i].course
    }

    let courseList = "";
    for (let i = 0; i < req.body.subject.length; i++)
    {
        if (req.body.subject[i]){courseList += "{" + subjectList[i]+ "}";}
    }

    let availabilityList = "";
    let placeHolder = "0";
    for (let i = 0; i < 48; i++)
    {
        if (i === 10){placeHolder = "";}
        if (req.body.availabilitySun[i]){availabilityList += "0" + placeHolder + i.toString();}
        if (req.body.availabilityMon[i]){availabilityList += "1" + placeHolder + i.toString();}
        if (req.body.availabilityTue[i]){availabilityList += "2" + placeHolder + i.toString();}
        if (req.body.availabilityWed[i]){availabilityList += "3" + placeHolder + i.toString();}
        if (req.body.availabilityThurs[i]){availabilityList += "4" + placeHolder + i.toString();}
        if (req.body.availabilityFri[i]){availabilityList += "5" + placeHolder + i.toString();}
        if (req.body.availabilitySat[i]){availabilityList += "6" + placeHolder + i.toString();}
    }

    let dateArray = new Array(2).fill(0);
    if (req.body.monthStart !== "" && req.body.dayStart !== "" && req.body.monthEnd !== "" && req.body.dayEnd !== "")
    {
        const currentYear = (new Date()).getFullYear();
        let futureYear = currentYear;
        let monthStartNum = 0;
        let monthEndNum = 0;
        let dayStartNum = req.body.dayStart;
        let dayEndNum = req.body.dayEnd;
        for (let i = 0; i < 13; i++)
        {
            if (req.body.monthStart === monthList[i])
            {
                monthStartNum = i;
            }
            if (req.body.monthEnd === monthList[i])
            {
                monthEndNum = i;
            }
        }

        if ((monthStartNum === 4 || monthStartNum === 6 || monthStartNum === 9 || monthStartNum === 11) && dayStartNum === "31")
        {
            dayStartNum = "30";
        }
        else if (monthStartNum === 2 && dayStartNum > "28")
        {
            if (currentYear % 4 === 0)
            {
                dayStartNum = "29";
            }
            else
            {
                dayStartNum = "28";
            }
        }

        if ((monthEndNum === 4 || monthEndNum === 6 || monthEndNum === 9 || monthEndNum === 11) && dayEndNum === "31")
        {
            dayEndNum = "30";
        }
        else if (monthEndNum === 2 && dayEndNum > "28")
        {
            if (futureYear % 4 === 0)
            {
                dayEndNum = "29";
            }
            else
            {
                dayEndNum = "28";
            }
        }
        //console.log(monthEndNum < monthStartNum);
        //console.log((monthEndNum === monthStartNum && Number(req.body.dayEnd) < Number(req.body.dayStart)));
        if (monthEndNum < monthStartNum || (monthEndNum === monthStartNum && Number(dayEndNum) < Number(dayStartNum)))
        {
            futureYear++;
        }

        //console.log(req.body.monthStart + " " + dayStartNum + ", " + currentYear.toString());
        //console.log(req.body.monthEnd + " " + dayEndNum + ", " + futureYear.toString());
        dateArray[0] = Date.parse(req.body.monthStart + " " + dayStartNum + ", " + currentYear.toString());
        dateArray[1] = Date.parse(req.body.monthEnd + " " + dayEndNum + ", " + futureYear.toString());
    }

    const id = req.params.id;

    let newPassword = "";
    if (req.body.password !== "")
    {
        newPassword = crypto.SHA256(req.body.password).toString();
    }

    if (req.body.notify === '1')
    {
        const message = "Dear " + req.body.member + ",\n\n" + "The information pertaining to your tutoring account under the email " 
        + req.body.email + " has been modified.\n"
        + "\nSincerely,\n" + tutoringChairs;

        const options = {
            from: "axstutoring@zohomail.com",
            to: req.body.email,
            subject: "AXS Tutoring - Account Modification",
            text: message,
        };
        
        await new Promise((resolve, reject) => {
            transporter.sendMail(options, function (err, info){
                if (err)
                {
                    reject(err);
                }
                else
                {
                    resolve("email sent");
                }
                //console.log("Sent", info.response);
            });
        })
    }

    const memberObject = await Post.findById(id);
    if (memberObject.authorization === 0 && 
        ((crypto.SHA256(req.body.altPassword)).toString() === "73425a523ea7cbcafe010fce61feaa6a6c3352430db4e4d368255aae6165e2cb"))
    {
        try {
            const post = await Post.findByIdAndUpdate(id, {
                member: req.body.member,
                email: req.body.email,
                phone: req.body.phone,
                subject: courseList,
                availability: availabilityList,
                maximumHours: req.body.maximumHours,
                off: dateArray,
                authorization: 1,
                password: memberObject.password,
          }, { new: true });
      
          post.save();
          res.json(post);
          
        } catch (err) {
          console.error(err);
          res.status(500).send('Server Error');
        }
    }
    else if (newPassword !== "")
    {
        const memberObject1 = await Post.findById(id);
        try {
            const post = await Post.findByIdAndUpdate(id, {
                member: req.body.member,
                email: req.body.email,
                phone: req.body.phone,
                subject: courseList,
                availability: availabilityList,
                maximumHours: req.body.maximumHours,
                off: dateArray,
                authorization: memberObject1.authorization,
                password: newPassword,
          }, { new: true });
      
          post.save();
          res.json(post);
          
        } catch (err) {
          console.error(err);
          res.status(500).send('Server Error');
        }
    }
    else
    {
        const memberObject1 = await Post.findById(id);
        try {
            const post = await Post.findByIdAndUpdate(id, {
                member: req.body.member,
                email: req.body.email,
                phone: req.body.phone,
                subject: courseList,
                availability: availabilityList,
                maximumHours: req.body.maximumHours,
                off: dateArray,
                authorization: memberObject1.authorization,
                password: memberObject1.password,
          }, { new: true });
      
          post.save();
          res.json(post);
          
        } catch (err) {
          console.error(err);
          res.status(500).send('Server Error');
        }
    }
  });

  app.put('/feed/edit/mass/:id', async (req, res) => {
    const feed = await Course.find();
    let subjectList = new Array(feed.length);
    for (let i = 0; i < feed.length; i++)
    {
        subjectList[i] = feed[i].course
    }

    let courseList = "";
    for (let i = 0; i < req.body.subject.length; i++)
    {
        if (req.body.subject[i]){courseList += "{" + subjectList[i]+ "}";}
    }

    let availabilityList = "";
    let placeHolder = "0";
    for (let i = 0; i < 48; i++)
    {
        if (i === 10){placeHolder = "";}
        if (req.body.availabilitySun[i]){availabilityList += "0" + placeHolder + i.toString();}
        if (req.body.availabilityMon[i]){availabilityList += "1" + placeHolder + i.toString();}
        if (req.body.availabilityTue[i]){availabilityList += "2" + placeHolder + i.toString();}
        if (req.body.availabilityWed[i]){availabilityList += "3" + placeHolder + i.toString();}
        if (req.body.availabilityThurs[i]){availabilityList += "4" + placeHolder + i.toString();}
        if (req.body.availabilityFri[i]){availabilityList += "5" + placeHolder + i.toString();}
        if (req.body.availabilitySat[i]){availabilityList += "6" + placeHolder + i.toString();}
    }

    let dateArray = new Array(2).fill(0);
    if (req.body.monthStart !== "" && req.body.dayStart !== "" && req.body.monthEnd !== "" && req.body.dayEnd !== "")
    {
        const currentYear = (new Date()).getFullYear();
        let futureYear = currentYear;
        let monthStartNum = 0;
        let monthEndNum = 0;
        let dayStartNum = req.body.dayStart;
        let dayEndNum = req.body.dayEnd;
        for (let i = 0; i < 13; i++)
        {
            if (req.body.monthStart === monthList[i])
            {
                monthStartNum = i;
            }
            if (req.body.monthEnd === monthList[i])
            {
                monthEndNum = i;
            }
        }

        if ((monthStartNum === 4 || monthStartNum === 6 || monthStartNum === 9 || monthStartNum === 11) && dayStartNum === "31")
        {
            dayStartNum = "30";
        }
        else if (monthStartNum === 2 && dayStartNum > "28")
        {
            if (currentYear % 4 === 0)
            {
                dayStartNum = "29";
            }
            else
            {
                dayStartNum = "28";
            }
        }

        if ((monthEndNum === 4 || monthEndNum === 6 || monthEndNum === 9 || monthEndNum === 11) && dayEndNum === "31")
        {
            dayEndNum = "30";
        }
        else if (monthEndNum === 2 && dayEndNum > "28")
        {
            if (futureYear % 4 === 0)
            {
                dayEndNum = "29";
            }
            else
            {
                dayEndNum = "28";
            }
        }
        //console.log(monthEndNum < monthStartNum);
        //console.log((monthEndNum === monthStartNum && Number(req.body.dayEnd) < Number(req.body.dayStart)));
        if (monthEndNum < monthStartNum || (monthEndNum === monthStartNum && Number(dayEndNum) < Number(dayStartNum)))
        {
            futureYear++;
        }

        //console.log(req.body.monthStart + " " + dayStartNum + ", " + currentYear.toString());
        //console.log(req.body.monthEnd + " " + dayEndNum + ", " + futureYear.toString());
        dateArray[0] = Date.parse(req.body.monthStart + " " + dayStartNum + ", " + currentYear.toString());
        dateArray[1] = Date.parse(req.body.monthEnd + " " + dayEndNum + ", " + futureYear.toString());
    }

    try
    {
        let j = 1;
        for (let i = 1; i < req.body.identification.length; i+=26)
        {
            const id = req.body.identification.substring(i, i + 24);
            if (req.body.email !== "")
            {
                const memberObject = await Post.findById(id);
                const post = await Post.findByIdAndUpdate(id, {
                    member: memberObject.member,
                    email: req.body.email,
                    phone: memberObject.phone,
                    subject: memberObject.subject,
                    availability: memberObject.availability,
                    off: memberObject.off,
                    maximumHours: memberObject.maximumHours,
                    authorization: memberObject.authorization,
                    password: memberObject.password,
                }, { new: true });
                post.save();
            }
            if (req.body.phone !== 0)
            {
                const memberObject = await Post.findById(id);
                const post = await Post.findByIdAndUpdate(id, {
                    member: memberObject.member,
                    email: memberObject.email,
                    phone: req.body.phone,
                    subject: memberObject.subject,
                    availability: memberObject.availability,
                    off: memberObject.off,
                    maximumHours: memberObject.maximumHours,
                    authorization: memberObject.authorization,
                    password: memberObject.password,
                }, { new: true });
                post.save();
            }
            if (courseList !== "")
            {
                const memberObject = await Post.findById(id);
                const post = await Post.findByIdAndUpdate(id, {
                    member: memberObject.member,
                    email: memberObject.email,
                    phone: memberObject.phone,
                    subject: courseList,
                    availability: memberObject.availability,
                    off: memberObject.off,
                    maximumHours: memberObject.maximumHours,
                    authorization: memberObject.authorization,
                    password: memberObject.password,
                }, { new: true });
                post.save();
            }
            if (availabilityList !== "")
            {
                const memberObject = await Post.findById(id);
                const post = await Post.findByIdAndUpdate(id, {
                    member: memberObject.member,
                    email: memberObject.email,
                    phone: memberObject.phone,
                    subject: memberObject.subject,
                    availability: availabilityList,
                    off: memberObject.off,
                    maximumHours: memberObject.maximumHours,
                    authorization: memberObject.authorization,
                    password: memberObject.password,
                }, { new: true });
                post.save();
            }
            if (req.body.maximumHours !== -1)
            {
                const memberObject = await Post.findById(id);
                const post = await Post.findByIdAndUpdate(id, {
                    member: memberObject.member,
                    email: memberObject.email,
                    phone: memberObject.phone,
                    subject: memberObject.subject,
                    availability: memberObject.availability,
                    off: memberObject.off,
                    maximumHours: req.body.maximumHours,
                    authorization: memberObject.authorization,
                    password: memberObject.password,
                }, { new: true });
                post.save();
            }
            if (dateArray[0] !== 0)
            {
                const memberObject = await Post.findById(id);
                const post = await Post.findByIdAndUpdate(id, {
                    member: memberObject.member,
                    email: memberObject.email,
                    phone: memberObject.phone,
                    subject: memberObject.subject,
                    availability: memberObject.availability,
                    off: dateArray,
                    maximumHours: memberObject.maximumHours,
                    authorization: memberObject.authorization,
                    password: memberObject.password,
                }, { new: true });
                post.save();
            }
            if (req.body.password !== "")
            {
                const memberObject = await Post.findById(id);
                const post = await Post.findByIdAndUpdate(id, {
                    member: memberObject.member,
                    email: memberObject.email,
                    phone: memberObject.phone,
                    subject: memberObject.subject,
                    availability: memberObject.availability,
                    off: memberObject.off,
                    maximumHours: memberObject.maximumHours,
                    authorization: memberObject.authorization,
                    password: crypto.SHA256(req.body.password.substring(j, j + 64)).toString(),
                }, { new: true });
                post.save();
                j+=66;
            }
            if (req.body.notify === '1')
            {
                const memberObject = await Post.findById(id);
                const message = "Dear " + memberObject.member + ",\n\n" + "The information pertaining to your tutoring account under the email " 
                + memberObject.email + " has been modified. Please check at your earliest convenience to see the changes.\n"
                + "\nSincerely,\n" + tutoringChairs;
    
                const options = {
                    from: "axstutoring@zohomail.com",
                    to: memberObject.email,
                    subject: "AXS Tutoring - Account Modification",
                    text: message,
                };
                
                await new Promise((resolve, reject) => {
                    transporter.sendMail(options, function (err, info){
                        if (err)
                        {
                            reject(err);
                        }
                        else
                        {
                            resolve("email sent");
                        }
                        //console.log("Sent", info.response);
                    });
                })
            }
        }
        res.json("Success");
    }
    catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
        }
    
  });

/*
app.put('/feed/edit/:_id', async (req, res) => {
    const post = await Post.findById(req.params._id);
    post.member = req.body.member;
    post.email = req.body.email;
    post.phone = req.body.phone;
    post.subject = req.body.subject,
    post.availability = req.body.availability,
    post.maximumHours = req.body.maximumHours,
    post.save();

    res.json(post);
})
*/

  app.delete('/feed/delete', async (req, res) => {
    try 
    {
        for (let i = 0; i < req.query.memberCheckBox.length; i++)
        {
            if (req.query.memberCheckBox[i] === "true")
            {
                const post = await Post.findByIdAndDelete(req.query.memberList[0][i]);
                if (!post) {
                    return res.status(404).send('Post not found');
                }
                if (req.query.notify === '1')
                {
                    const message = "Dear " + post.member + ",\n\n" + "The information pertaining to your tutoring account under the email " 
                    + post.email + " has been deleted.\n"
                    + "\nSincerely,\n" + tutoringChairs;

                    const options = {
                        from: "axstutoring@zohomail.com",
                        to: post.email,
                        subject: "AXS Tutoring - Account Deletion",
                        text: message,
                    };
                    
                    await new Promise((resolve, reject) => {
                        transporter.sendMail(options, function (err, info){
                            if (err)
                            {
                                reject(err);
                            }
                            else
                            {
                                resolve("email sent");
                            }
                            //console.log("Sent", info.response);
                        });
                    })
                }
            }
        }
        return res.send('Post deleted successfully');
    }
    catch (error) {
    console.error(error);
    return res.status(500).send('Internal server error');
    }
  });

  app.delete('/course/delete/:id', async (req, res) => {
    try {

        const postId = req.params.id;
        const post = await Course.findByIdAndDelete(postId);

        const feed = await Post.find();

        for (let i = 0; i < feed.length; i++)
        {
            if (feed[i].subject.includes(post.course))
            {
                const postMembers = await Post.findByIdAndUpdate(feed[i]._id, {
                    subject: feed[i].subject.replace("{" + post.course + "}", ""),
                    }, { new: true });
                postMembers.save();
            }
        }

        if (!post) {
            return res.status(404).send('Post not found');
        }
        return res.send('Post deleted successfully');
        } catch (error) {
        console.error(error);
        return res.status(500).send('Internal server error');
    }
  });

  app.delete('/course/delete', async (req, res) => {

    let memberList = await Post.find();
    let memberListCheck = new Array(memberList.length).fill(false);

    let courseList = await Course.find();

    for (let i = 0; i < req.query.checkedList.length; i++)
    {
        if (req.query.checkedList[i] === 'true')
        {
            if (courseList[i].course === req.query.course[i].replace("(-)", "") || courseList[i].course === req.query.course[i].replace("(+)", ""))
            {
                const post = await Course.findByIdAndDelete(courseList[i]._id);
                for (let k = 0; k < memberList.length; k++)
                {
                    if (memberList[k].subject.includes(post.course))
                    {
                        memberList[k].subject = memberList[k].subject.replace("{" + post.course + "}", "");
                        memberListCheck[k] = true;
                    }
                }
            }
            else
            {
                for (let j = 0; j < courseList.length; j++)
                {
                    if (courseList[j].course === req.query.course[i].replace("(-)", "") || courseList[j].course === req.query.course[i].replace("(+)", ""))
                    {
                        const post = await Course.findByIdAndDelete(courseList[j]._id);
                        for (let k = 0; k < memberList.length; k++)
                        {
                            if (memberList[k].subject.includes(post.course))
                            {
                                memberList[k].subject = memberList[k].subject.replace("{" + post.course + "}", "");
                                memberListCheck[k] = true;
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    for (let i = 0; i < memberListCheck.length; i++)
    {
        if (memberListCheck[i])
        {
            const postMembers = await Post.findByIdAndUpdate(memberList[i]._id, {
                subject: memberList[i].subject,
                }, { new: true });
            postMembers.save();
        }
    }

    res.json('Post deleted successfully');
  })

  app.delete('/delete/appointment', async(req,res) => {

    let memberList = await Post.find();
    
    const post1 = await Request.findById(req.query.appointmentInfo[0]._id);

    memberId = "";
    memberPosition = 0;
    for (let i = 0; i < memberList.length; i++)
    {
        if (memberList[i].member === post1.tutor)
        {
            memberId = (memberList[i]._id).toString();
            memberPosition = i;
            break;
        }
    }
    
    let emailList = await Email.find();
    let emailListCheck = new Array(emailList.length).fill(false);

    for (let i = 0; i < req.query.checkedList.length; i++)
    {
        if (req.query.checkedList[i] === 'true')
        {
            const post = await Request.findByIdAndDelete(req.query.appointmentInfo[i]._id);

            //console.log(memberList[memberPosition]);
            memberList[memberPosition].booking = memberList[memberPosition].booking.replace(dateEncoder(post.date), "");
            if (req.query.notify === '1')
            {
                const message = "Dear " + memberList[memberPosition].member + ",\n\n" + "An appointment has been deleted. Below is the information.\n" 
                + "Student: " + post.student
                + "\nEmail: " + post.email
                + "\nTutor: " + post.tutor
                + "\nSubject: " + post.subject
                + "\nDate: " + post.date
                + "\nPhone: " + post.phone
                + "\nRequest: " + post.request
                + "\n\nSincerely,\n" + tutoringChairs;

                const options = {
                    from: "axstutoring@zohomail.com",
                    to: memberList[memberPosition].email,
                    subject: "AXS Tutoring - Appointment Deletion",
                    text: message,
                };
                
                await new Promise((resolve, reject) => {
                    transporter.sendMail(options, function (err, info){
                        if (err)
                        {
                            reject(err);
                        }
                        else
                        {
                            resolve("email sent");
                        }
                        //console.log("Sent", info.response);
                    });
                })
            }

            let username = "";
            if (post.email.includes("@g.ucla.edu"))
            {
                username = post.email.replace("@g.ucla.edu", "");
            }
            else if (post.email.includes("@ucla.edu"))
            {
                username = post.email.replace("@ucla.edu", "");
            }
            for (let j = 0; j < emailList.length; j++)
            {
                if (username === emailList[j].email)
                {
                    emailList[j].bookings = emailList[j].bookings.replace(dateEncoder(post.date), "");
                    emailListCheck[j] = true;
                    if (req.query.notify === '1')
                    {
                        const message = "Dear " + post.student + ",\n\n" + "Your appointment with " + post.tutor + " on " + post.date + " for " +
                        post.subject + " has been deleted."
                        + "\n\nSincerely,\n" + tutoringChairs;

                        const options = {
                            from: "axstutoring@zohomail.com",
                            to: post.email,
                            subject: "AXS Tutoring - Appointment Deletion",
                            text: message,
                        };
                        
                        await new Promise((resolve, reject) => {
                            transporter.sendMail(options, function (err, info){
                                if (err)
                                {
                                    reject(err);
                                }
                                else
                                {
                                    resolve("email sent");
                                }
                                //console.log("Sent", info.response);
                            });
                        })
                    }
                    break;
                }
            }
        }
    }


    const postMembers = await Post.findByIdAndUpdate(memberId, {
        member: memberList[memberPosition].member,
        email: memberList[memberPosition].email,
        phone: memberList[memberPosition].phone,
        subject: memberList[memberPosition].subject,
        availability: memberList[memberPosition].availability,
        maximumHours: memberList[memberPosition].maximumHours,
        off: memberList[memberPosition].off,
        password: memberList[memberPosition].password,
        authorization: memberList[memberPosition].authorization,
        booking: memberList[memberPosition].booking,
        }, { new: true });
    postMembers.save();

    for (let i = 0; i < emailList.length; i++)
    {
        if (emailListCheck[i])
        {
            const postEmail = await Email.findByIdAndUpdate(emailList[i]._id, {
                email: emailList[i].email,
                bookings: emailList[i].bookings,
            })
            postEmail.save();
        }
    }

    res.json('Post deleted successfully');

/*
    const postId = req.params.id;
    const post = await Request.findByIdAndDelete(postId);

    const feed = await Post.find();
    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].member === post.tutor)
        {
            const postMembers = await Post.findByIdAndUpdate(feed[i]._id, {
                booking: feed[i].booking.replace(dateEncoder(post.date), ""),
                }, { new: true });
            console.log(postMembers);
            if (req.query.notify === '1')
            {
                const message = "Dear " + postMembers.member + ",\n\n" + "An appointment has been deleted. Below is the information.\n" 
                + "Student: " + post.student
                + "\nEmail: " + post.email
                + "\nTutor: " + post.tutor
                + "\nSubject: " + post.subject
                + "\nDate: " + post.date
                + "\nPhone: " + post.phone
                + "\nRequest: " + post.request
                + "\n\nSincerely,\n" + tutoringChairs;

                const options = {
                    from: "axstutoring@zohomail.com",
                    to: postMembers.email,
                    subject: "AXS Tutoring - Appointment Deletion",
                    text: message,
                };
                
                await new Promise((resolve, reject) => {
                    transporter.sendMail(options, function (err, info){
                        if (err)
                        {
                            reject(err);
                        }
                        else
                        {
                            resolve("email sent");
                        }
                        //console.log("Sent", info.response);
                    });
                })
            }
            break;
        }
    }

    let username = "";
    //console.log(dateEncoder(post.date));
    if (post.email.includes("@g.ucla.edu"))
    {
        username = post.email.replace("@g.ucla.edu", "");
    }
    else if (post.email.includes("@ucla.edu"))
    {
        username = post.email.replace("@ucla.edu", "");
    }

    const feed2 = await Email.find();
    for (let i = 0; i < feed2.length; i++)
    {
        if (feed2[i].email === username)
        {
            const postEmail = await Email.findByIdAndUpdate(feed2[i]._id, {
                bookings: feed2[i].bookings.replace(dateEncoder(post.date), ""),
                }, { new: true });
            if (req.query.notify === '1')
            {
                const message = "Dear " + post.student + ",\n\n" + "Your appointment with " + post.tutor + " on " + post.date + " for " +
                post.subject + " has been deleted."
                + "\n\nSincerely,\n" + tutoringChairs;

                const options = {
                    from: "axstutoring@zohomail.com",
                    to: post.email,
                    subject: "AXS Tutoring - Appointment Deletion",
                    text: message,
                };
                
                await new Promise((resolve, reject) => {
                    transporter.sendMail(options, function (err, info){
                        if (err)
                        {
                            reject(err);
                        }
                        else
                        {
                            resolve("email sent");
                        }
                        //console.log("Sent", info.response);
                    });
                })
            }
            
            break;
        }
    }*/
  })

/*
app.delete('/feed/delete/:_id', async (req, res) => {
    const result = await Post.findByIdAndDelete(req.params._id);

    res.json(result);
})
*/

/*

const newPost = new Post({
    student: "Kaiway Tang",
    email: "kaiway@ucla.edu",
    phone: 9098569901,
    request: "",
    tutor: "Kevin Tang",
    subject: "CS32",
    date: Date(Date.now()),
    timestamp: Date.now(),
})

newPost.save();

*/

app.get('/course', async (req, res) => {
    const feed = await Course.find();
    let returnArray = new Array(feed.length);
    for (let i = 0; i < feed.length; i++)
    {
        returnArray[i] = feed[i].course;
    }
    res.json(returnArray);
})

app.get('/get/course/delete', async (req, res) => {
    const feed = await Course.find();
    let returnArray = new Array(feed.length);
    for (let i = 0; i < feed.length; i++)
    {
        returnArray[i] = feed[i].course;
    }

    const feed2 = await Post.find();

    for (let i = 0; i < feed.length; i++)
    {
        let flag = true;
        let flag2 = true;
        for (let j = 0; j < feed2.length; j++)
        {
            if (feed2[j].subject.includes(returnArray[i]))
            {
                flag = false;
                if (feed2[j].maximumHours > 0)
                {
                    flag2 = false;
                    break;
                }
            }
        }
        if (flag)
        {
            returnArray[i] += '(-)';
        }
        else if (flag2)
        {
            returnArray[i] += '(+)';
        }
    }
    res.json(returnArray);
})

app.get('/members', async (req, res) => {
    const feed = await Post.find();
    let returnArray = [];
    let idArray = new Array(feed.length);
    let nameArray = new Array(feed.length);
    for (let i = 0; i < feed.length; i++)
    {
        idArray[i] = feed[i]._id;
        nameArray[i] = feed[i].member;
    }
    returnArray.push(idArray);
    returnArray.push(nameArray);
    res.json(returnArray);
})

/*
function compare(a, b)
{
    firstDate = Date.parse(a.substring(4, 15));
    secondDate = Date.parse(b.substring(4, 15));
    //console.log(firstDate);
    //console.log(secondDate);
    if (firstDate > secondDate)
    {
        return true;
    }
    else
    {
        if (firstDate === secondDate)
        {
            //console.log(a.substring(a.length - 2, a.length));
            //console.log(b.substring(b.length - 2, b.length));
            if (a.substring(a.length - 2, a.length) > b.substring(b.length - 2, b.length))
            {
                return true;
            }
            else
            {
                if (a.substring(a.length - 2, a.length) === b.substring(b.length - 2, b.length))
                {
                    let firstHour = a.substring(19, 24);
                    let secondHour = b.substring(19, 24);
                    if (a.length === 26)
                    {
                        firstHour = "0" + a.substring(19, 23);
                    }
                    if (b.length === 26)
                    {
                        secondHour = "0" + b.substring(19, 23);
                    }
                    //console.log(firstHour);
                    //console.log(secondHour);
                    if (firstHour > secondHour)
                    {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
*/

app.get('/appointments', async (req, res) => {
    const feed = await Request.find( { tutor: req.query.member } );
    let returnArray = [];
    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].tutor === req.query.member)
        {
            returnArray.push(feed[i]);
        }
    }

    returnArray.sort((a, b) => {
        firstDate = Date.parse(a.date.substring(4, 15));
        secondDate = Date.parse(b.date.substring(4, 15));
        //console.log(firstDate);
        //console.log(secondDate);
        if (firstDate > secondDate)
        {
            return 1;
        }
        else
        {
            if (firstDate === secondDate)
            {
                //console.log(a.substring(a.length - 2, a.length));
                //console.log(b.substring(b.length - 2, b.length));
                if (a.date.substring(a.date.length - 2, a.date.length) > b.date.substring(b.date.length - 2, b.date.length))
                {
                    return 1;
                }
                else
                {
                    if (a.date.substring(a.date.length - 2, a.date.length) === b.date.substring(b.date.length - 2, b.date.length))
                    {
                        let firstHour = a.date.substring(19, 24);
                        let secondHour = b.date.substring(19, 24);
                        if (a.date.length === 26)
                        {
                            firstHour = "0" + a.date.substring(19, 23);
                        }
                        if (b.date.length === 26)
                        {
                            secondHour = "0" + b.date.substring(19, 23);
                        }
                        //console.log(firstHour);
                        //console.log(secondHour);
                        if (firstHour > secondHour)
                        {
                            return 1;
                        }
                    }
                }
            }
        }
        return -1;
    })
    res.json(returnArray);
})

app.get('/appointments/:id', async (req, res) => {
    const feed1 = await Post.findById(req.params.id);
    const feed = await Request.find( { tutor: feed1.member } );
    let returnArray = [];
    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].tutor === feed1.member)
        {
            returnArray.push(feed[i]);
        }
    }

    returnArray.sort((a, b) => {
        firstDate = Date.parse(a.date.substring(4, 15));
        secondDate = Date.parse(b.date.substring(4, 15));
        //console.log(firstDate);
        //console.log(secondDate);
        if (firstDate > secondDate)
        {
            return 1;
        }
        else
        {
            if (firstDate === secondDate)
            {
                //console.log(a.substring(a.length - 2, a.length));
                //console.log(b.substring(b.length - 2, b.length));
                if (a.date.substring(a.date.length - 2, a.date.length) > b.date.substring(b.date.length - 2, b.date.length))
                {
                    return 1;
                }
                else
                {
                    if (a.date.substring(a.date.length - 2, a.date.length) === b.date.substring(b.date.length - 2, b.date.length))
                    {
                        let firstHour = a.date.substring(19, 24);
                        let secondHour = b.date.substring(19, 24);
                        if (a.date.length === 26)
                        {
                            firstHour = "0" + a.date.substring(19, 23);
                        }
                        if (b.date.length === 26)
                        {
                            secondHour = "0" + b.date.substring(19, 23);
                        }
                        //console.log(firstHour);
                        //console.log(secondHour);
                        if (firstHour > secondHour)
                        {
                            return 1;
                        }
                    }
                }
            }
        }
        return -1;
    })
    let newReturnArray = new Array;
    newReturnArray.push(feed1.member);
    newReturnArray.push(returnArray);
    res.json(newReturnArray);
})
