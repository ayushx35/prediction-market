import express from 'express';
const app = express();
import cors from 'cors';

app.use(express.json);
app.use(cors);
// endpoints

app.post('/buy', (req, res) => {

});
app.post('/sell', (req, res) => {

});
app.post('/split', (req, res) => {

});
app.post('/merge', (req, res) => {

});
app.get('/balance', (req, res) => {

});
app.get('/history', (req, res) => {

});

app.listen(3000, () => {
    console.log("Server running on port 3000");
})