import express from 'express';
// import { ProjectConfig } from '@pdcp/shared';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('PDCP Server');
});

// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });
