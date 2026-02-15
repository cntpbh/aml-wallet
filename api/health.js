// api/health.js
module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    status: "ok", version: "2.1.0",
    providers: {
      etherscan: !!process.env.ETHERSCAN_API_KEY,
      bscscan: !!process.env.BSCSCAN_API_KEY,
      polygonscan: !!process.env.POLYGONSCAN_API_KEY,
      chainabuse: !!process.env.CHAINABUSE_API_KEY,
      blocksec: !!process.env.BLOCKSEC_API_KEY,
    },
  });
};
