const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = 5000

// middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://food-sharing-ass.web.app',
        'https://food-sharing-ass.firebaseapp.com'
    ],
    credentials: true,

}));  ///ai config er jonno cookie client side a jabe
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aezqr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyToken = async (req, res, next) => {
    const token = req?.cookies?.token;  // getting cookie from req
    console.log('verifyToken ', token);
    if (!token) {
        return res.status(401).send({ message: 'not authorized' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        //error
        if (err) {
            console.log(err);
            return res.status(401).send({ message: 'unauthorized' })
        }
        // if token is valid  then it would be decoded
        console.log('value in the decoded', decoded);
        req.user = decoded
        next()
    })
}
const cookieOption = {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    secure: process.env.NODE_ENV === 'production' ? true : false,
}

async function run() {
    try {
        // await client.connect();
        const foodCollection = client.db('foodDB').collection('foods');

        //JWT authentication // when this api got heat, token has been made
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            console.log(user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' }) // Token is generated up to this point
            // res.cookie('token', token, {
            //     httpOnly: true,
            //     secure: false, // if https then secure will be true in my case http://localhost:5000 thats why secure is false
            //     // sameSite: 'none' // server and client is not same url thats why samesite none. if it is then 
            // }).send({ success: true })
            res.cookie('token', token, cookieOption).send({ success: true })
        })

        //JWT logout
        app.post('/logout', async (req, res) => {
            const user = req.body;
            console.log('logout user', user);
            // res.clearCookie('token', { maxAge: 0 }).send({ success: true })
            res.clearCookie('token', { ...cookieOption, maxAge: 0 }).send({ success: true })
        })

        //All available foods
        app.get('/availableFoods', async (req, res) => {
            const query = { foodStatus: 'available' };
            const cursor = foodCollection.find(query);
            const result = await cursor.toArray()
            res.send(result)
        })

        // Sort/Search working
        app.get('/availableFoodsSort/:sort', async (req, res) => {
            const sort = req.params.sort
            const search = req.query.search || '';
            const query = {
                foodStatus: 'available',
                foodName: { $regex: search, $options: 'i' }
            };
            if (sort === 'foodName') {
                const result = await foodCollection.aggregate([
                    { $match: query },
                    {
                        $addFields: {
                            normalizedFoodName: { $toLower: '$foodName' }
                        }
                    },
                    { $sort: { normalizedFoodName: 1 } },
                    { $project: { normalizedFoodName: 0 } }
                ]).toArray();
                return res.send(result)
            }
            else if (sort === 'foodQuantity') {
                const cursor = foodCollection.find(query).sort({ foodQuantity: -1 })
                const result = await cursor.toArray()
                return res.send(result)
            }
            else if (sort === 'expire') {
                const result = await foodCollection.aggregate([
                    { $match: query }, // Match documents with 'available' foodStatus
                    {
                        $addFields: {
                            expiredDate: { $toDate: "$expiredDateTime" } // Convert to date
                        }
                    },
                    { $sort: { expiredDate: -1 } }, // Sort by the new date field
                    { $project: { expiredDate: 0 } } // Remove the temporary field
                ]).toArray();
                return res.send(result);
            }
        });

        //All data
        app.get('/foods', async (req, res) => {
            const cursor = foodCollection.find().sort({ foodQuantity: -1 }).limit(6);
            const result = await cursor.toArray()
            return res.send(result)
        })

        // Email 
        app.get('/emailFoods', verifyToken, async (req, res) => {
            const authorizedUser = req.user?.email; //authorizedEmail from verifyToken
            const email = req.query?.email;
            if (authorizedUser !== email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            console.log(email);
            const query = { donatorEmail: email };
            const cursor = foodCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)
        })

        //Specific food detail
        app.get('/foods/:id', verifyToken, async (req, res) => {
            console.log('user in the valid token', req.user);
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await foodCollection.findOne(query)
            res.send(result)
        })

        //Adding food
        app.post('/foods', verifyToken, async (req, res) => {
            const food = req.body
            const result = await foodCollection.insertOne(food);
            res.send(result)
        })

        // Request
        app.put('/foods/:_id', verifyToken, async (req, res) => {
            const id = req.params._id
            const filter = { _id: new ObjectId(id) }
            const updatedFood = req.body
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    foodStatus: updatedFood.foodStatus,
                    requestDate: updatedFood.requestDate,
                    additionalNotes: updatedFood.additionalNotes
                },
            }
            const result = await foodCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        //Getting requested food
        app.get('/requestedFoods', verifyToken, async (req, res) => {
            const query = { foodStatus: 'requested' };
            const cursor = foodCollection.find(query);
            const result = await cursor.toArray()
            res.send(result)
        })

        //Update
        app.put('/food/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updatedFood = req.body
            console.log(updatedFood);
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    foodName: updatedFood.foodName,
                    foodImage: updatedFood.foodImage,
                    pickupLocation: updatedFood.pickupLocation,
                    foodQuantity: updatedFood.foodQuantity,
                    additionalNotes: updatedFood.additionalNotes,
                    expiredDateTime: updatedFood.expiredDateTime,
                },
            }
            const result = await foodCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        //Delete food
        app.delete('/food/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await foodCollection.deleteOne(query);
            res.send(result);
        })

        //Cancel food
        app.put('/requestedFoods/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    foodStatus: 'available'
                },
            }
            const result = await foodCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })
        // await client.db("admin").command({ ping: 1 });
        console.log("You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})