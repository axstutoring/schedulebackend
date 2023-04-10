const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
connection = "mongodb+srv://KevinTang:0hmlsVIAJwbjWuTf@axs-tutoring.c24c5cd.mongodb.net/?retryWrites=true&w=majority";//2xvy-BTPm7zNyvj
const crypto = require('crypto-js');

const tutoringChairs = "Arthur Huang and Claire Luong";

//const hash = crypto.SHA256("Hello").toString();
/*const transporter = nodemailer.createTransport( {service: "hotmail",auth: {user: "axstutoring@outlook.com",pass: "B4y27*Zct,3.Nw/"}});*/

const transporter = nodemailer.createTransport( {
    service: "Zoho",
    auth: {
        user: "axstutoring@zohomail.com",
        pass: "Rs5m4zTPmncNsxZ"
    }
});

mongoose.set('strictQuery', false);

mongoose
    .connect (connection, 
        {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        .then(() => console.log("Connected to DB"))
        .catch(console.error);

const app = express();
app.use(express.json());
app.use(cors());

app.listen(8080, () => {console.log("Server listening on port 8080");})

const Request = require("./models/request");

const Course = require("./models/course");

const Post = require("./models/post");

const Email = require("./models/email");

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

const subjectDivision = ["Chemistry", "Biology", "Math", "Physics", "Comp Sci"];

function dateEncoder(bookDate)  //compresses the date into string of numbers. "Thu Mar 16 2023 at 10:00AM" would become {40820230316}
{
    const weekList = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
        if (comparisonString === monthList[j])
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

function checkDateRange(bookDate, days) //returns true if current time is outside the range of the bookDate + days
{
    const monthList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    dateProcessor = monthList[Number(bookDate[8] + bookDate[9]) - 1] + ' ' + bookDate[10] + bookDate[11] + ' '
    + bookDate[4] + bookDate[5] + bookDate[6] + bookDate[7];

    let hour = timeTable[Number(bookDate[2] + bookDate[3])];
    if (hour.substring(hour.length - 2, hour.length) === "PM" && hour.substring(0, 2) !== "12")
    {
        let hourNumber = Number(hour.substring(0, 2)) + 12;
        hour = hourNumber.toString() + hour.substring(2, 5);
    }

    let dayLightSavings = false;
    const currentDate = new Date();
    if (currentDate.getMonth() > 2 && currentDate.getMonth() < 10)
    {
        dayLightSavings = true;
    }
    else if (currentDate.getMonth() === 2 && (currentDate.getDate() - currentDate.getDay() > 7))
    {
        dayLightSavings = true;
    }
    else if (currentDate.getMonth() === 10 && (currentDate.getDate() - currentDate.getDay() <= 0))
    {
        dayLightSavings = true;
    }

    if (dayLightSavings)
    {
        return (((Date.parse(dateProcessor + ' ' + hour) + days*86400000) + 25200000) < Date.now())
    }
    else
    {
        return (((Date.parse(dateProcessor + ' ' + hour) + days*86400000) + 28800000) < Date.now())
    }
}

function user(email)
{
    email = email.toLowerCase();
    if (email.includes("@g.ucla.edu"))
    {
        return (email.replace("@g.ucla.edu", ""));
    }
    else if (email.includes("@ucla.edu"))
    {
        return (email.replace("@ucla.edu", ""));
    }
    return "";
}

app.get('/startup', async (req, res) => {
    res.json(0);
})

app.get('/checkemail', async (req, res) => {
    const feed = await Email.find();
    let flag = 1;
    let username = user(req.query.email);
    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].email === username && (feed[i].bookings.length === 0 || feed[i].bookings[0] != '-'))
        {
            let updatedString = "";
            let bookingsThisWeek = 0;
            const todayDate = new Date();
            for (let j = 0; j < feed[i].bookings.length; j+= 13)
            {
                if (checkDateRange(feed[i].bookings.substring(j, j + 13), 21))
                {
                    updatedString += feed[i].bookings.substring(j, j + 13);
                }
                if (checkDateRange(feed[i].bookings.substring(j, j + 13), 0))
                {
                    bookingsThisWeek++;
                }
            }
            const post = await Email.findByIdAndUpdate(feed[i]._id, {
                bookings: updatedString,
            }, { new: true });
            post.save();
            if (bookingsThisWeek < 2 && updatedString.length < 52)
            {
                flag = 0;
            }
            else if (updatedString.length >= 52)
            {
                flag = 2;
            }
            else if (bookingsThisWeek >= 2)
            {
                flag = 3;
            }
            break;
        }
    }
    res.json(flag);
})

app.get('/checkcode', async (req, res) => {
    const feed = await Email.find();

    let flag = false;
    let username = user(req.query.email);
    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].email === username)
        {
            if (feed[i].bookings.substring(1, 7) === req.query.code)
            {
                flag = true;
                if (feed[i].bookings.length > 0 && feed[i].bookings[0] === '-')
                {
                    const id = feed[i]._id;
                    const post = await Email.findByIdAndUpdate(id, {
                        bookings: "",
                    }, { new: true });
                    post.save();
                }
            }
        }
    }

    res.json(flag);
})

app.post('/email/new', async (req, res) => {
    const feed = await Email.find();

    let code = "";

    for (let i = 0; i < 6; i++)
    {
        code += Math.floor(Math.random() * 10).toString();
    }
    let username = user(req.body.email);
    let flag = true;
    let sendEmail = false;

    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].email === username)
        {
            if (Date.now() - Number(feed[i].bookings.substring(8)) > 60000)
            {
                const id = feed[i]._id;
                const post = await Email.findByIdAndUpdate(id, {
                    bookings: "-" + code + "|" + Date.now().toString(),
                }, { new: true });
                post.save();
                sendEmail = true;
            }
            flag = false;
            break;
        }
    }
    if (flag)
    {
        const post = new Email({
            email: username,
            bookings: "-" + code + "|" + Date.now().toString(),
        });
        post.save();
        sendEmail = true;
    }

    if (sendEmail)
    {
        const message = "Dear " + req.body.student + ",\n\n" + "Please enter " + code + " to validate your email.\n"
        + "\nSincerely,\n" + tutoringChairs;

        const options = {
            from: "axstutoring@zohomail.com",
            to: req.body.email,
            subject: "AXS Tutoring - Email Validation",
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
            });
        })
    }
    res.json(0);
})

app.get('/courselist', async (req, res) => {
    const feed = await Course.find();

    let returnArray = new Array;

    function isNumber(str){
        return /^\d+$/.test(str);
    }

    let position = 0;
    for (; position < subjectDivision.length; position++)
    {
        if (subjectDivision[position] === req.query.series)
        {
            break;
        }
    }
    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].subjectDivision[position])
        {
            if (req.query.alternative !== "")
            {
                if (req.query.alternative === "Up")
                {
                    let count = 0;
                    for (let j = 0; j < feed[i].course.length; j++)
                    {
                        if (isNumber(feed[i].course[j]))
                        {
                            count++;
                        }
                    }
                    if (count === 3)
                    {
                        returnArray.push(feed[i].course);
                    }
                }
                else if (req.query.alternative === "Ot")
                {
                    if ((!feed[i].course.includes("14") && !feed[i].course.includes("20") && !feed[i].course.includes("30")))
                    {
                        let count = 0;
                        for (let j = 0; j < feed[i].course.length; j++)
                        {
                            if (isNumber(feed[i].course[j]))
                            {
                                count++;
                            }
                        }
                        if (count < 3)
                        {
                            returnArray.push(feed[i].course);
                        }
                    }
                }
                else if ((feed[i].course.includes(req.query.alternative)))
                {
                    returnArray.push(feed[i].course);
                }
            }
            else{
                returnArray.push(feed[i].course);
            }
        }
    }
    returnArray.sort();
    res.json(returnArray);
})

app.get('/tutorlist', async (req, res) => {
    const feed = await Post.find();

    let returnArray = new Array;
    for (let i = 0; i < feed.length; i++)
    {
        if ((feed[i].subject.includes(req.query.series)) && feed[i].maximumHours > 0)
        {
            returnArray.push(feed[i].member);
        }
    }

    res.json(returnArray);
})

app.get('/find/appointment/info', async (req, res) => {
    const feed = await Request.find();
    const feed1 = await Email.find();
    const feed2 = await Post.find();

    let response = false;

    let memberEmail = "";

    const identity = req.query.info[6];

    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].timestamp === identity && feed[i].tutor === req.query.info[2] && feed[i].date === req.query.info[4])
        {
            if ((feed[i]._id.toString()).substring((feed[i]._id.toString()).length - 5, (feed[i]._id.toString()).length) === req.query.code)
            {
                let username = user(req.query.info[1]);

                for (let j = 0; j < feed1.length; j++)
                {
                    if (feed1[j].email === username)
                    {
                        const id = feed1[j]._id;
                        const post = await Email.findByIdAndUpdate(id, {
                            bookings: feed1[j].bookings.replace(dateEncoder(req.query.info[4]), ""),
                        }, { new: true });
                        post.save();
                        break;
                    }
                }

                for (let j = 0; j < feed2.length; j++)
                {
                    if (feed2[j].member === req.query.info[2])
                    {
                        const id = feed2[j]._id;
                        memberEmail = feed2[j].email;
                        const post = await Post.findByIdAndUpdate(id, {
                            booking: feed2[j].booking.replace(dateEncoder(req.query.info[4]), ""),
                        }, { new: true });
                        post.save();
                        break;
                    }
                }

                const result = await Request.findByIdAndDelete(feed[i]._id);

                const message = "Dear " + result.tutor + ",\n\nYour appointment with " + result.student + " has been cancelled." + 
                "\nBelow were the details:\n"
                + "Student: " + result.student + "\n"
                + "Email: " + result.email + "\n"
                + "Subject: " + result.subject + "\n"
                + "Date: " + result.date + "\n"
                + "Phone: " + result.phone + "\n"
                + "Request: " + result.request + "\n"
                + "\nSincerely,\n" + tutoringChairs;

                const options = {
                    from: "axstutoring@zohomail.com",
                    to: memberEmail,
                    subject: "AXS Tutoring - Appointment Cancelled",
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
                    });
                })

                const message1 = "Dear " + result.student + ",\n\nThis is a confirmation of your cancellation for tutoring with " 
                + result.tutor + " on " + result.date + " for " + result.subject + ". No further action is required." + 
                "\n\nSincerely,\n" + tutoringChairs
                + "\n\n[Do not reply to this email. For all inquiries please contact us at tutoring.axsbg@gmail.com]";

                const options1 = {
                    from: "axstutoring@zohomail.com",
                    to: result.email,
                    subject: "AXS Tutoring - Appointment Cancellation",
                    text: message1,
                };
                
                await new Promise((resolve, reject) => {
                    transporter.sendMail(options1, function (err, info){
                        if (err)
                        {
                            reject(err);
                        }
                        else
                        {
                            resolve("email sent");
                        }
                    });
                })
                response = true;
                break;
            }
        }
    }
    res.json(response);
})

app.get('/find/appointment', async (req, res) => {
    const feed = await Request.find();

    const feed2 = await Course.find();

    let returnArray = new Array(2).fill([]);
    let upcomingAppointment = [];
    let pastAppointment = [];

    let username = user(req.query.email);

    for (let i = 0; i < feed.length; i++)
    {
        if ((feed[i].email.toLowerCase() === username + "@ucla.edu") || (feed[i].email.toLowerCase() === username + "@g.ucla.edu"))
        {
            let hour = feed[i].date.substring(19, 24);
            if (feed[i].date.length === 26)
            {
                hour = "0" + feed[i].date.substring(19, 23);
            }
            if (feed[i].date.substring(feed[i].date.length - 2, feed[i].date.length) === "PM" && hour.substring(0, 2) !== "12")
            {
                let hourNumber = Number(hour.substring(0, 2)) + 12;
                hour = hourNumber.toString() + hour.substring(2, 5);
            }
            const dateTranslator = Date.parse(feed[i].date.substring(4, 15) + ' ' + hour);
            const todayDate = Date.now();

            let dayLightSavings = false;
            const currentDate = new Date();
            if (currentDate.getMonth() > 2 && currentDate.getMonth() < 10)
            {
                dayLightSavings = true;
            }
            else if (currentDate.getMonth() === 2 && (currentDate.getDate() - currentDate.getDay() > 7))
            {
                dayLightSavings = true;
            }
            else if (currentDate.getMonth() === 10 && (currentDate.getDate() - currentDate.getDay() <= 0))
            {
                dayLightSavings = true;
            }
            
            if ((dayLightSavings && (dateTranslator + 25200000) > todayDate) || (!dayLightSavings && (dateTranslator + 28800000) > todayDate))
            {
                for (let j = 0; j < feed2.length; j++)
                {
                    if (feed2[j].course === feed[i].subject)
                    {
                        for (let k = feed2[j].subjectDivision.length - 1; k >= 0; k--)
                        {
                            if (feed2[j].subjectDivision[k])
                            {
                                const template = [feed[i].student, feed[i].email, feed[i].tutor, 
                                                    feed[i].subject, feed[i].date, k, feed[i].timestamp];
                                upcomingAppointment.push(template);
                                break;
                            }
                        }
                        break;
                    }
                }
            }
            else
            {
                for (let j = 0; j < feed2.length; j++)
                {
                    if (feed2[j].course === feed[i].subject)
                    {
                        for (let k = feed2[j].subjectDivision.length - 1; k >= 0; k--)
                        {
                            if (feed2[j].subjectDivision[k])
                            {
                                const template = [feed[i].student, feed[i].email, feed[i].tutor, 
                                                    feed[i].subject, feed[i].date, k];
                                //console.log(template);
                                pastAppointment.push(template);
                                break;
                            }
                        }
                        break;
                    }
                }
            }
        }
    }
    upcomingAppointment.sort((a, b) => {
        firstDate = Date.parse(a[4].substring(4, 15));
        secondDate = Date.parse(b[4].substring(4, 15));
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
                if (a[4].substring(a[4].length - 2, a[4].length) > b[4].substring(b[4].length - 2, b[4].length))
                {
                    return 1;
                }
                else
                {
                    if (a[4].substring(a[4].length - 2, a[4].length) === b[4].substring(b[4].length - 2, b[4].length))
                    {
                        let firstHour = a[4].substring(19, 24);
                        let secondHour = b[4].substring(19, 24);
                        if (a[4].length === 26)
                        {
                            firstHour = "0" + a[4].substring(19, 23);
                        }
                        if (b[4].length === 26)
                        {
                            secondHour = "0" + b[4].substring(19, 23);
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
    pastAppointment.sort((a, b) => {
        firstDate = Date.parse(a[4].substring(4, 15));
        secondDate = Date.parse(b[4].substring(4, 15));
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
                if (a[4].substring(a[4].length - 2, a[4].length) > b[4].substring(b[4].length - 2, b[4].length))
                {
                    return 1;
                }
                else
                {
                    if (a[4].substring(a[4].length - 2, a[4].length) === b[4].substring(b[4].length - 2, b[4].length))
                    {
                        let firstHour = a[4].substring(19, 24);
                        let secondHour = b[4].substring(19, 24);
                        if (a[4].length === 26)
                        {
                            firstHour = "0" + a[4].substring(19, 23);
                        }
                        if (b[4].length === 26)
                        {
                            secondHour = "0" + b[4].substring(19, 23);
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
    returnArray[0] = upcomingAppointment;
    returnArray[1] = pastAppointment;
    res.json(returnArray);
})

app.get('/datelist', async (req, res) => {
    const feed = await Post.find();

    let week = new Array;

    for (let i = 0; i < 7; i++)
    {
        let hour = new Array(48).fill(false);
        week.push(hour);
    }

    let returnArray = [];
    let comparisonString = "";
    let savedString = "";
    let maxHours = 0;
    let dayOffStart = 0;
    let dayOffEnd = 0;

    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].member === req.query.memberName)
        {
            dayOffStart = feed[i].off[0];
            dayOffEnd = feed[i].off[1];
            maxHours = feed[i].maximumHours;
            for (let j = 0; j < feed[i].availability.length; j+=3)
            {
                week[Number(feed[i].availability[j])][Number(feed[i].availability[j + 1] + feed[i].availability[j + 2])] = true;
            }

            for (let j = 0; j < feed[i].booking.length; j+= 13)
            {
                let bookingString = feed[i].booking.substring(j, j + 13);
                if (!checkDateRange(bookingString, 0))
                {
                    comparisonString += bookingString;
                }
                if (!checkDateRange(bookingString, 5))
                {
                    savedString += bookingString;
                }
            }
            
            for (let j = 1; j < comparisonString.length; j+=13)
            {
                for (let k = 0; k < 4; k++)
                {
                    week[Number(comparisonString[j])][Number(comparisonString[j + 1] + comparisonString[j + 2]) + k] = false;
                }
            }

            const id = feed[i]._id;
            const post = await Post.findByIdAndUpdate(id, {
                booking: savedString,
            }, { new: true });
        
            post.save();
            //console.log(week);
            break;
        }
    }

    //console.log(week);

    let dateObject = new Date();

    let dayLightSavings = false;
    const currentDate = new Date();
    if (currentDate.getMonth() > 2 && currentDate.getMonth() < 10)
    {
        dayLightSavings = true;
    }
    else if (currentDate.getMonth() === 2 && (currentDate.getDate() - currentDate.getDay() > 7))
    {
        dayLightSavings = true;
    }
    else if (currentDate.getMonth() === 10 && (currentDate.getDate() - currentDate.getDay() <= 0))
    {
        dayLightSavings = true;
    }

    for (let i = dateObject.getDay() + 1; i < 7; i++)
    {
        for (let j = 0; j < 48; j++)
        {
            if (week[i][j])
            {
                if (j > 44)
                {
                    break;
                }
                let check = false;
                for (k = 0; k < 4; k++)
                {
                    if (!week[i][j+k])
                    {
                        check = true;
                        break;
                    }
                }
                if (check)
                {
                    break;
                }
                let dayOfWeek = i;
                //console.log(i);
                dateObject = new Date();
                //console.log(dateObject);
                //console.log(dayOfWeek);
                //console.log(currentDate.getDay());
                if (dateObject.getDay() >= dayOfWeek)
                {
                    dayOfWeek += 7;
                }
                //console.log(dayOfWeek);
                //console.log(currentDate.getDay());
                if (dayOfWeek - dateObject.getDay() > 2)
                {
                    dateObject.setDate(dayOfWeek - dateObject.getDay() + dateObject.getDate());
                    if (dayLightSavings && ((dayOffStart + 25200000 > Date.parse(dateObject)) || (Date.parse(dateObject) > dayOffEnd + 25200000)))
                    {
                        returnArray.push(dateObject.toDateString() + " at " + timeTable[j]);
                    }
                    else if (!dayLightSavings && ((dayOffStart + 28800000 > Date.parse(dateObject)) || (Date.parse(dateObject) > dayOffEnd + 28800000)))
                    {
                        returnArray.push(dateObject.toDateString() + " at " + timeTable[j]);
                    }
                    //console.log(futureDate.toDateString() + " at " + timeTable[j]);
                }
                else if (dayOfWeek - dateObject.getDay() === 2 && dateObject.getHours() < (j*0.25 + 8))
                {
                    dateObject.setDate(dayOfWeek - dateObject.getDay() + dateObject.getDate());
                    if (dayLightSavings && ((dayOffStart + 25200000 > Date.parse(dateObject)) || (Date.parse(dateObject) > dayOffEnd + 25200000)))
                    {
                        returnArray.push(dateObject.toDateString() + " at " + timeTable[j]);
                    }
                    else if (!dayLightSavings && ((dayOffStart + 28800000 > Date.parse(dateObject)) || (Date.parse(dateObject) > dayOffEnd + 28800000)))
                    {
                        returnArray.push(dateObject.toDateString() + " at " + timeTable[j]);
                    }
                }
            }
        }
    }

    dateObject = new Date();

    for (let i = 0; i < dateObject.getDay() + 1; i++)
    {
        for (let j = 0; j < 48; j++)
        {
            if (week[i][j])
            {
                if (j > 44)
                {
                    break;
                }
                let check = false;
                for (k = 0; k < 4; k++)
                {
                    if (!week[i][j+k])
                    {
                        check = true;
                        break;
                    }
                }
                if (check)
                {
                    break;
                }
                let dayOfWeek = i;
                //console.log(i);
                const dateObject = new Date();
                //console.log(dayOfWeek);
                //console.log(currentDate.getDay());
                if (dateObject.getDay() >= dayOfWeek)
                {
                    dayOfWeek += 7;
                }
                //console.log(dayOfWeek);
                //console.log(currentDate.getDay());
                if (dayOfWeek - dateObject.getDay() > 2)
                {
                    dateObject.setDate(dayOfWeek - dateObject.getDay() + dateObject.getDate());
                    if (dayLightSavings && ((dayOffStart + 25200000 > Date.parse(dateObject)) || (Date.parse(dateObject) > dayOffEnd + 25200000)))
                    {
                        returnArray.push(dateObject.toDateString() + " at " + timeTable[j]);
                    }
                    else if (!dayLightSavings && ((dayOffStart + 28800000 > Date.parse(dateObject)) || (Date.parse(dateObject) > dayOffEnd + 28800000)))
                    {
                        returnArray.push(dateObject.toDateString() + " at " + timeTable[j]);
                    }
                }
                else if (dayOfWeek - dateObject.getDay() === 2 && dateObject.getHours() < (j*0.25 + 8))
                {
                    dateObject.setDate(dayOfWeek - dateObject.getDay() + dateObject.getDate());
                    if (dayLightSavings && ((dayOffStart + 25200000 > Date.parse(dateObject)) || (Date.parse(dateObject) > dayOffEnd + 25200000)))
                    {
                        returnArray.push(dateObject.toDateString() + " at " + timeTable[j]);
                    }
                    else if (!dayLightSavings && ((dayOffStart + 28800000 > Date.parse(dateObject)) || (Date.parse(dateObject) > dayOffEnd + 28800000)))
                    {
                        returnArray.push(dateObject.toDateString() + " at " + timeTable[j]);
                    }
                }
            }
        }
    }
    //console.log(week);

    if (savedString.length / 13 >= maxHours)
    {
        returnArray = [];
    }

    res.json(returnArray);
})

app.post('/request/new', async (req, res) => {

    const feed = await Post.find();

    let memberEmail = "";

    dateProcessor = dateEncoder(req.body.date);

    for (let i = 0; i < feed.length; i++)
    {
        if (feed[i].member === req.body.tutor)
        {
            memberEmail = feed[i].email;
            const id = feed[i]._id;
            const booking = feed[i].booking;
            try {
                const post = await Post.findByIdAndUpdate(id, {
                    booking: booking + dateProcessor,
              }, { new: true });
          
              post.save();
              
            } catch (err) {
              console.error(err);
              //res.status(500).send('Server Error');
            }
            break;
        }
    }
    const post = new Request({
        student: req.body.student,
        email: req.body.email,
        phone: req.body.phone,
        request: req.body.request,
        tutor: req.body.tutor,
        subject: req.body.subject,
        date: req.body.date,
        timestamp: Date(Date.now()),
    });
    
    const message = "Dear " + req.body.tutor + ",\n\nYou have received a new appointment with " + req.body.student + ".\nBelow are the details:\n"
    + "Student: " + req.body.student + "\n"
    + "Email: " + req.body.email + "\n"
    + "Subject: " + req.body.subject + "\n"
    + "Date: " + req.body.date + "\n"
    + "Phone: " + req.body.phone + "\n"
    + "Request: " + req.body.request + "\n"
    + "\nSincerely,\n" + tutoringChairs;

    const options = {
        from: "axstutoring@zohomail.com",
        to: memberEmail,
        subject: "AXS Tutoring - New Appointment",
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
    /*
    const message1 = "Dear " + req.body.student + ",\n\nThis is a confirmation of your request for tutoring with " 
    + req.body.tutor + " on " + req.body.date + " for " + req.body.subject + ". Please email them" +  
    " the materials that you would like to go over 24 hours before the scheduled appointment time at " + memberEmail +
    ".\n\nAppointment ID: " + (post._id.toString()).substring((post._id.toString()).length - 5, (post._id.toString()).length) +
    "\n\nThank you for choosing AXS Tutoring.\n\nSincerely,\n" + tutoringChairs
    + "\n\n[Do not reply to this email. For all inquiries please contact us at tutoring.axsbg@gmail.com]";

    const options1 = {
        from: "axstutoring@zohomail.com",
        to: req.body.email,
        subject: "AXS Tutoring - Appointment Confirmation - " + (post._id.toString()).substring((post._id.toString()).length - 5, (post._id.toString()).length),
        text: message1,
    };
    
    await new Promise((resolve, reject) => {
        transporter.sendMail(options1, function (err, info){
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
    */

    const feed1 = await Email.find();

    let username = user(req.body.email);

    for (let i = 0; i < feed1.length; i++)
    {
        if (feed1[i].email === username)
        {
            const id = feed1[i]._id;
            const booking = feed1[i].bookings;
            if (booking.length === 0 || booking[0] === "-")
            {
                const post1 = await Email.findByIdAndUpdate(id, {
                    bookings: dateProcessor,
                }, { new: true });
              
                post1.save();
            }
            else{
                const post1 = await Email.findByIdAndUpdate(id, {
                    bookings: booking + dateProcessor,
                }, { new: true });
              
                post1.save();
            }
            
        }
    }

    post.save();
    res.json(post);
})

app.delete('/feed/delete/:_id', async (req, res) => {
    const result = await Post.findByIdAndDelete(req.params._id);

    res.json(result);
})

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