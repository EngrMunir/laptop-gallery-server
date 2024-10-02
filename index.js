const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId, Admin } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yk1xelo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// require('crypto').randomBytes(64).toString('hex')

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db('laptopDb').collection('users');
    const productCollection = client.db('laptopDb').collection('products');
    const reviewCollection = client.db('laptopDb').collection('reviews');
    const cartCollection = client.db('laptopDb').collection('carts');
    const paymentCollection = client.db('laptopDb').collection('payments');

    // jwt related api
    app.post('/jwt', async(req,res)=>{
      const user = req.body;
      // console.log('jwt user',user)
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,{expiresIn:'1hr'});
      res.send({token});
    })

    // middlewares
    const verifyToken = (req,res,next) =>{
      // console.log('headers',req.headers);
      if(!req.headers.authorization){
        return res.status(401).send({message:'unauthorize access'})
      }
      
      const token =req.headers.authorization.split(' ')[1];
      console.log('token',token)

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err,decoded)=>{
        if(err){
          console.log(decoded)
          return res.status(401).send({message:'unauthorize access'})
        }
        req.decoded =decoded;
        next();
      })
    }

    // use verify admin after verify token
    const verifyAdmin = async(req, res, next)=>{
      const email = req.decoded.email;
      // console.log('verify admin email',email)
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message:'forbidden access-1'})
      }
      next();
    }
    // users related api
    app.get('/users',verifyToken, verifyAdmin, async(req,res)=>{
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.get('/user/admin/:email',verifyToken,async(req,res)=>{
      const email = req.params.email;
      // console.log('user',email)
      // console.log('decoded ',req.decoded.email)
      if(email !== req.decoded.email){
        return res.status(403).send({message:'forbidden access'})
      }
      const query ={ email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === 'admin';
      }
      res.send({admin})
    })

    app.post('/users',async(req,res)=>{
      const user= req.body;
      // insert email if user does not exist
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if(existingUser){
        return res.send({message:'user already exists', insertedId:null})
      }
      const result = await userCollection.insertOne(user);
      res.send(result)
    })

    app.patch('/users/admin/:id',verifyToken, verifyAdmin, async(req,res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc ={
        $set:{
          role:'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/users/:id',verifyToken, verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // product related api
    app.get('/product', async(req,res)=>{
        const result = await productCollection.find().toArray();
        res.send(result);
    })

    app.get('/product/:id', async(req,res)=>{
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    })

    app.post('/product',verifyToken, verifyAdmin, async(req,res)=>{
      const item = req.body;
      const result = await productCollection.insertOne(item);
      res.send(result);
    })

    app.patch('/product/:id',async(req, res)=>{
      const item = req.body;
      const id = req.params.id;
      const filter ={_id: new ObjectId(id)}
      const updatedDoc ={
        $set:{
              name:item.name,
              price: item.price,
              processor: item.processor,
              ram: item.ram,
              storage:item.storage,
              graphicsCard:item.graphicsCard,
              display: item.display,
              operatingSystem:item.operatingSystem,
              brand: item.brand,
              batteryLife:item.batteryLife,
              weight:item.weight,
              description: item.description,
              category:item.category,
              image: item.image
        }
      }
      const result = await productCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/product/:id',verifyToken,verifyAdmin, async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await productCollection.deleteOne(query);
      res.send(result);
    })
    // cart related api
    app.get('/carts', async(req, res)=>{
      const email = req.query.email;
      const query = { email: email }
      const result = await cartCollection.find(query).toArray();
      res.send(result)
    })
    app.post('/carts', async(req,res)=>{
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    })
    app.delete('/carts/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })
    app.get('/reviews', async(req,res)=>{
        const result = await reviewCollection.find().toArray();
        res.send(result);
    })

    // payment related api
    app.post('/create-payment-intent',async(req,res) =>{
      const { price } = req.body;
      const amount = parseInt(price*100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency:'usd',
        payment_method_types:['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.get('/payments/:email', async(req,res)=>{
      const query ={ email: req.params.email }
      if(req.params.email !== req.decoded.email){
          return res.status(403).send({message:'forbidden access'})
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result)
    })
    app.post('/payments', async(req, res)=>{
      const payment= req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      // delete item from the cart
      const query ={_id:{
        $in:payment.cartIds.map(id => new ObjectId(id))
      }}

      const deleteResult = await cartCollection.deleteMany(query);
      res.send({paymentResult, deleteResult});
    })

    // stats or analytics
    app.get('/admin-stats',verifyToken, verifyAdmin, async(req, res)=>{
      const users =  await userCollection.estimatedDocumentCount();
      const productItems = await productCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment)=> total+payment, 0)

      const result = await paymentCollection.aggregate([
        {
          $group:{
            _id:null,
            totalRevenue:{
              $sum:'$price'
            }
          }
        }
      ]).toArray();

      const revenue = result.length > 0? result[0].totalRevenue: 0;

      res.send({users, productItems, orders, revenue})
    })
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req,res)=>{
    res.send('laptop gallery is running')
})
app.listen(port,()=>{
    console.log(`laptop gallery is running on port ${port}`)
})

/**
 * ---------------------
 * naming convention
 * ---------------------
 * app.get('/users)
 * app.get('/users/:id)
 * app.post('/users)
 * app.put('/users/:id)
 * app.patch('/users/:id)
 * app.delete('/users/:id)
 * 
 * */ 