import app from './app.js';

const port = Number(process.env.PORT || 9091);
app.listen(port, () => {
  console.log(`KnowTree API listening at http://localhost:${port}/api/v1`);
});
