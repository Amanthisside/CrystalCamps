if(process.env.NODE_ENV !== 'production' ){
    require('dotenv').config();
}

const express=require('express');
const path=require('path');
const mongoose =require('mongoose');
const ejsMate=require('ejs-mate')
// const Joi = require('joi');
const ExpressError= require('./utils/ExpressError')
const methodOverride= require('method-override');
const flash= require('connect-flash');
const session= require('express-session');
// const { fork } = require('child_process');
const passport=require('passport');
const LocalStrategy= require('passport-local');
const User= require('./models/user');
// const leaflet=require('leaflet');
//MVC - Model View Controller
const campgroundRoutes= require('./routes/campgrounds');
const reviewRoutes= require('./routes/reviews');
const userRoutes= require('./routes/users');
const mongoSanitize=require('express-mongo-sanitize');
const dbUrl = process.env.DB_URL || 'mongodb://localhost:27017/yelp-camp';
const MongoDBStore=require("connect-mongo")(session);

const fs = require("fs");
const tls = require("tls");

tls.DEFAULT_MIN_VERSION = "TLSv1.2"; // Render + Node20 TLS fix

mongoose.set('strictQuery', true);

async function connectDB() {
    try {
        // Production-ready MongoDB connection
        let mongooseOptions = {
            serverSelectionTimeoutMS: 8000
        };
        // Use CA bundle only for Atlas/cloud connections and if file exists
        const isAtlas = dbUrl && dbUrl.includes('mongodb+srv');
        const caPath = "/etc/ssl/certs/ca-certificates.crt";
        const useCA = isAtlas && process.platform !== 'win32' && require('fs').existsSync(caPath);
        if (useCA) {
            mongooseOptions.tls = true;
            mongooseOptions.tlsCAFile = caPath;
        }
        await mongoose.connect(dbUrl, mongooseOptions);
        console.log("Database connected");
    } catch (err) {
        console.error("Mongo connection error:", err);
    }
}

connectDB();

const app=express();
const store= new MongoDBStore({
    url:dbUrl,
    secret:'thisshouldbeabettersecret',
    touchAfter:24*60*60
});
store.on("error",function(e){
    console.log("Session Store Erorr",e);
})
const sessionConfig={
    store,
    secret:'thisshouldbeabettersecret',
    resave:false,
    saveUninitialized:true,
    cookie:{
        httpOnly:true,
        expires: Date.now() +1000*60*60*24*7, //date.now is in milliseconds, so we convert into a week so it expires after a week here
        maxAge:1000*60*60*24*7
    }
}
app.use(session(sessionConfig));
app.use(flash());
app.use(mongoSanitize()); //mongo sanitize is basically a package used to remove $ or . sign from the req or the params. lets say a user enters a query like $gt:"" this will return all the usernames. we dont need that

app.engine('ejs',ejsMate);
app.set('view engine', 'ejs');
app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname,'public')));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req,res,next)=>{
    // console.log(req.session)
    res.locals.currentUser=req.user;
    res.locals.success= req.flash('success');
    res.locals.error=req.flash('error');
    next();
 })


app.get('/',(req,res)=>{
    res.render('home');
})

// app.get('/makecampground', async(req,res)=>{
//     const camp= new Campground({title:'My Backyard',description:'Cheap Camping'});
//     await camp.save();
//     res.send(camp);

// })
// app.get('/fakeUser',async (req,res)=>{
//     const user=await new User({email:'colttt@gmail.com',username:'colttt'});
//     const NewUser=await User.register(user,'chicken') //takes the instance of the model and the password
//     res.send(NewUser);
//     // {"email":"colttt@gmail.com","_id":"66b8711172936d755f638651","username":"colttt","salt":"bbbce5b4e659134b72e398bfca3b7b483fd9f0d2dee70d9844987b33a27cb82e","hash":"bfc22d93572bdc6810a76c23d8b81823c7f12f35ee8d2d5b8fd8aa3edae78ea92085f3bdaf02bce1bb35500453cfd2c7b63746f1b9768ef2483c2d052aadbd7f0326b8e76cb3404bc24c258fad29ae476ef44c75d405c032c3bf4c7d7e44d123e80ed01a22a546b75e861a37eab2df14bea713f50495e3407a445274d1ca36257fb9f00e5417a034b544539e7970414643589c2dcf4d158fdcf15a8d4202542a0dd6c41831ab81bbfd7f0cf399fe5341f5ed60d7d19469e6ab4aefd90be02d2789d2712360d10ff1efa19239db21d67d53af2a2e0564bf1e930b43a61ff65a8da07a655674fe9838a23ecf927ec757800c0cae9a48340f572151e356189a45658718691fbb00c485c09dc5336c5c9b0644056a86a9f71893825fc2c3dae7f307a723d09d5944385c34834517704adcaba7122ab82531058096970d3d434933425207460e84407c52e82cc44c0f54cdac25f362f12d4e15d1208e18262db67744682b6daa3b66c60925f7702082cbb6bec4aabf6f9b07040161e7e781e056832efd0bd82bac5f3e68fcfa28731072951ddf2085b645e611eb83936f58968abfa64c8b7e45dec46768f6601b9e1165fd11178fad8ce4b4c70c96095b88e4567ba40e9b419b354be6f2665b14f141705085029cbdea338b79513e9cd76126c4b18c6a87acf645d7599da277c3b25a838d08a6b10394191d1db4a20e701426320106","__v":0}
// })

app.use('/',userRoutes);
app.use('/campgrounds',campgroundRoutes);
app.use('/campgrounds/:id/reviews',reviewRoutes);

app.all('*',(req,res,next)=>{
    next( new ExpressError('Page Not Found',401))
    // res.send('404');
})
app.use((err,req,res,next)=>{
// res.send("oh boy something went wrong")
// const {message='Something got wrong',statusCode=404}= err;
const {statusCode=500}=err;
if(!err.message) err.message="Oh no not found"
res.status(statusCode).render('error',{err});

})
app.listen(3000,()=>{
    console.log('Serving on Port 3000')
})
