import fs from "fs";
import path from "path";
import FormData from "form-data";
import HttpsAgent from "https-proxy-agent";
import axios from "axios";

const POINT_NODE_HOST = process.argv[2];
const POINT_NODE_PORT = process.argv[3];

const main = async () => {
  if (!(POINT_NODE_HOST && POINT_NODE_PORT)) {
    throw new Error(
      "Bad arguments, expected: upload.ts <POINT_NODE_HOST> <POINT_NODE_PORT>"
    );
  }

  const httpsAgent = new (HttpsAgent as any)({
    host: POINT_NODE_HOST,
    port: POINT_NODE_PORT,
    protocol: "http",
  });

  const file = fs.createReadStream(
    path.join(
      __dirname,
      "..",
      "..",
      "build",
      "contracts",
      "Identity.sol",
      "Identity.json"
    )
  );
  const form = new FormData();
  form.append("my_file", file);

  const res = await axios.post("https://somehost.point/_storage/", form, {
    headers: form.getHeaders(),
    httpsAgent,
  });

  return res.data.data;
};

main()
  .then((hash) => {
    console.log(`Identity successfully deployed: ${hash}`);
  })
  .catch((e) => {
    console.error("Upload failed");
    console.error(e);
  });
