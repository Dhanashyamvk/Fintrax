const { extractAndParseBill } = require("./bill");

extractAndParseBill({ imagePath: "./samplebill.png" })
  .then(result => {
    console.log(result.parsed);
  })
  .catch(err => console.error(err));
