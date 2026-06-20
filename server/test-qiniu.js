/**
 * 七牛云集成验证脚本
 * 用法: node test-qiniu.js  (在 server/ 目录下执行)
 */
require('dotenv/config');
const qiniu = require('qiniu');
const fs = require('fs');
const path = require('path');

async function main() {
  const accessKey = process.env.QINIU_ACCESS_KEY;
  const secretKey = process.env.QINIU_SECRET_KEY;
  const bucket = process.env.QINIU_BUCKET;
  const domain = process.env.QINIU_DOMAIN;

  console.log('=== 七牛云集成验证 ===');
  console.log('Bucket:', bucket);
  console.log('Domain:', domain);
  console.log('Zone: 华东(z0)');

  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const config = new qiniu.conf.Config();
  config.zone = qiniu.zone.Zone_z0;
  config.useHttpsDomain = true;

  // 1. 测试上传凭证生成
  const putPolicy = new qiniu.rs.PutPolicy({ scope: bucket, expires: 7200 });
  const uploadToken = putPolicy.uploadToken(mac);
  console.log('√ UploadToken 生成成功');

  // 2. 测试文件上传
  const testFile = path.join(__dirname, 'test-upload.txt');
  fs.writeFileSync(testFile, 'Qiniu integration test - ' + new Date().toISOString());

  await new Promise((resolve, reject) => {
    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();
    const key = 'dev-test/test-upload.txt';

    formUploader.putFile(uploadToken, key, testFile, putExtra, (respErr, respBody, respInfo) => {
      fs.unlinkSync(testFile); // clean up

      if (respErr) {
        console.error('× 上传失败:', respErr.message);
        return reject(respErr);
      }
      if (respInfo.statusCode === 200) {
        const url = 'https://' + domain + '/' + key;
        console.log('√ 上传成功, status:', respInfo.statusCode);
        console.log('  响应:', JSON.stringify(respBody));
        console.log('  CDN 地址:', url);
        resolve(url);
      } else {
        console.error('× 上传失败, status:', respInfo.statusCode, JSON.stringify(respBody));
        reject(new Error('Upload failed'));
      }
    });
  });

  console.log('=== 集成验证通过 ===');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
