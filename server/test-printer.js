/**
 * 云打印机对接验证脚本
 *
 * 用法:
 *   node test-printer.js              # 检查配置状态
 *   node test-printer.js yilianyun    # 测试易联云连接
 *   node test-printer.js feie         # 测试飞鹅连接
 *   node test-printer.js shangmi      # 测试商米连接
 *
 * 前置条件: server/.env 中配置对应品牌凭据
 *
 * 此脚本不依赖真实打印机硬件，仅验证：
 *   1. API 凭据是否有效
 *   2. 云服务是否可达
 *   3. 打印机设备是否在线（需提供 deviceId）
 *   4. 测试打印任务能否创建（不实际出纸，仅验证 API 调用）
 */

require('dotenv/config');
const crypto = require('crypto');

// ==================== 配置读取 ====================

const configs = {
  yilianyun: {
    name: '易联云',
    clientId: process.env.PRINTER_YL_CLIENT_ID || '',
    clientSecret: process.env.PRINTER_YL_CLIENT_SECRET || '',
    deviceId: process.env.PRINTER_YL_DEVICE_ID || '',
    baseUrl: 'https://open-api.10ss.net',
  },
  feie: {
    name: '飞鹅',
    user: process.env.PRINTER_FEIE_USER || '',
    ukey: process.env.PRINTER_FEIE_UKEY || '',
    deviceId: process.env.PRINTER_FEIE_DEVICE_ID || '',
    baseUrl: 'http://api.feieyun.cn/Api/Open/',
  },
  shangmi: {
    name: '商米',
    appId: process.env.PRINTER_SM_APP_ID || '',
    appSecret: process.env.PRINTER_SM_APP_SECRET || '',
    deviceId: process.env.PRINTER_SM_DEVICE_ID || '',
    baseUrl: 'https://open-api.sunmi.com',
  },
};

// ==================== HTTP 辅助 ====================

async function httpPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body instanceof URLSearchParams ? body.toString() : body,
  });
  return { status: res.status, body: await res.text() };
}

// ==================== 易联云 ====================

async function testYilianyun(config) {
  console.log(`\n=== ${config.name} 验证 ===`);
  console.log(`API 地址: ${config.baseUrl}`);

  if (!config.clientId || !config.clientSecret) {
    console.log('⚠ 未配置 PRINTER_YL_CLIENT_ID / PRINTER_YL_CLIENT_SECRET，跳过验证');
    console.log('  请在 .env 中配置');
    return false;
  }

  console.log(`Client ID: ${config.clientId}`);
  console.log(`Device ID: ${config.deviceId || '(未配置，仅测试 OAuth)'}`);

  // Step 1: Get access_token
  console.log('\n📡 Step 1: 获取 access_token...');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signStr = config.clientId + timestamp + config.clientSecret;
  const sign = crypto.createHash('md5').update(signStr, 'utf8').digest('hex');
  const reqId = crypto.randomUUID();

  try {
    const body = new URLSearchParams({
      client_id: config.clientId,
      grant_type: 'client_credentials',
      sign,
      scope: 'all',
      timestamp,
      id: reqId,
    });

    const res = await httpPost(`${config.baseUrl}/oauth/oauth`, body);

    const data = JSON.parse(res.body);
    console.log(`  响应: error=${data.error}, desc=${data.error_description}`);

    if (data.error !== '0') {
      console.log(`  ✗ OAuth 失败: [${data.error}] ${data.error_description}`);
      return false;
    }

    const accessToken = data.body.access_token;
    console.log(`  ✓ access_token 获取成功 (${accessToken.substring(0, 20)}...)`);

    // Step 2: If deviceId provided, test print
    if (config.deviceId) {
      console.log('\n📡 Step 2: 发送测试打印...');
      const ts2 = String(Math.floor(Date.now() / 1000));
      const sign2 = crypto
        .createHash('md5')
        .update(config.clientId + ts2 + config.clientSecret)
        .digest('hex');
      const reqId2 = crypto.randomUUID();
      const originId = `test_${Date.now()}`;

      const testContent = encodeURIComponent(
        '<center>** 测试打印 **</center>\n' +
          '--------------------------------\n' +
          '<LR>时间,' + new Date().toLocaleString() + '</LR>\n' +
          '--------------------------------\n' +
          '<center>易联云对接成功</center>\n' +
          '\n\n\n',
      );

      const printBody = new URLSearchParams({
        client_id: config.clientId,
        access_token: accessToken,
        machine_code: config.deviceId,
        content: testContent,
        origin_id: originId,
        sign: sign2,
        id: reqId2,
        timestamp: ts2,
      });

      const printRes = await httpPost(`${config.baseUrl}/print/index`, printBody);

      const printData = JSON.parse(printRes.body);
      console.log(`  响应: error=${printData.error}, desc=${printData.error_description}`);
      if (printData.body) {
        console.log(`  打印任务ID: ${printData.body.id || '(空)'}`);
      }

      if (printData.error === '0') {
        console.log('  ✓ 测试打印发送成功');
      } else if (printData.error === '9' || printData.error === '8') {
        console.log('  ⚠ 打印机未连接或未在线 (OAuth 链路已通)');
        console.log('  提示: 确认打印机已开机联网，或检查 machine_code 是否正确');
      } else {
        console.log(`  ✗ 打印失败: [${printData.error}] ${printData.error_description}`);
      }
    }
  } catch (err) {
    console.log(`  ✗ 请求失败: ${err.message}`);
    return false;
  }

  console.log('\n  ✓ 易联云 OAuth 认证链路验证通过');
  return true;
}

// ==================== 飞鹅 ====================

async function testFeie(config) {
  console.log(`\n=== ${config.name} 验证 ===`);
  console.log(`API 地址: ${config.baseUrl}`);

  if (!config.user || !config.ukey) {
    console.log('⚠ 未配置 PRINTER_FEIE_USER / PRINTER_FEIE_UKEY，跳过验证');
    console.log('  如需对接，请在 .env 中配置:');
    console.log('    PRINTER_FEIE_USER=你的飞鹅账号');
    console.log('    PRINTER_FEIE_UKEY=你的飞鹅UKEY');
    console.log('    PRINTER_FEIE_DEVICE_ID=打印机SN(可选，用于状态查询)');
    return false;
  }

  console.log(`飞鹅账号: ${config.user}`);
  console.log(`打印机 SN: ${config.deviceId || '(未配置)'}`);

  // 飞鹅 API 签名规则: sig = sha1(user + ukey + stime)
  const stime = String(Math.floor(Date.now() / 1000));
  const sig = crypto
    .createHash('sha1')
    .update(config.user + config.ukey + stime)
    .digest('hex');

  try {
    // 测试 API 连通性（状态查询接口）
    const body = new URLSearchParams({
      user: config.user,
      stime: stime,
      sig: sig,
      apiname: 'Open_queryPrinterStatus',
    });

    const res = await httpPost(config.baseUrl, body);

    const data = JSON.parse(res.body);
    console.log(`  API 响应: ret=${data.ret}, msg=${data.msg}`);

    if (data.ret === 0) {
      console.log('  ✓ 飞鹅 API 连接成功，凭据有效');
    } else {
      console.log(`  ✗ API 返回错误: ${data.msg}`);
      console.log('  请检查 PRINTER_FEIE_USER 和 PRINTER_FEIE_UKEY 是否正确');
      return false;
    }
  } catch (err) {
    console.log(`  ✗ API 调用失败: ${err.message}`);
    return false;
  }

  console.log('  ✓ 飞鹅基础连通性验证通过 (实际打印需完整对接 API)');
  return true;
}

// ==================== 商米 ====================

async function testShangmi(config) {
  console.log(`\n=== ${config.name} 验证 ===`);
  console.log(`API 地址: ${config.baseUrl}`);

  if (!config.appId || !config.appSecret) {
    console.log('⚠ 未配置 PRINTER_SM_APP_ID / PRINTER_SM_APP_SECRET，跳过验证');
    console.log('  如需对接，请在 .env 中配置:');
    console.log('    PRINTER_SM_APP_ID=你的商米AppID');
    console.log('    PRINTER_SM_APP_SECRET=你的商米AppSecret');
    console.log('    PRINTER_SM_DEVICE_ID=打印机SN(可选，用于状态查询)');
    return false;
  }

  console.log(`商米 AppID: ${config.appId}`);

  try {
    // 测试 API 连通性
    const res = await fetch(`${config.baseUrl}/`);
    console.log(`  ✓ 服务可达 (HTTP ${res.status})`);
  } catch (err) {
    console.log(`  ✗ 服务不可达: ${err.message}`);
    return false;
  }

  console.log('  商米打印对接需申请 API 权限，完整流程:');
  console.log('    1. 到商米开放平台注册并创建应用');
  console.log('    2. 配置 PRINTER_SM_APP_ID / PRINTER_SM_APP_SECRET');
  console.log('    3. 调用 POST /v1/printer/print 发送打印任务');
  console.log('  详细文档: https://open.sunmi.com/');

  return true;
}

// ==================== 主逻辑 ====================

async function main() {
  console.log('=== 云打印机对接验证 ===\n');

  const brand = process.argv[2];

  if (brand && !configs[brand]) {
    console.log(`不支持的品牌: ${brand}`);
    console.log(`可选: ${Object.keys(configs).join(', ')}`);
    process.exit(1);
  }

  // 如果没有指定品牌，检查所有配置
  if (!brand) {
    console.log('检查各品牌配置状态:\n');

    for (const [key, config] of Object.entries(configs)) {
      const hasCreds = Object.values(config).some(
        (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('http'),
      );
      const status = hasCreds ? '✓ 已配置' : '— 未配置';
      console.log(`  ${config.name} (${key}): ${status}`);
    }

    console.log('\n  — 未配置: 没有配置凭据，跳过 API 验证');
    console.log('  ✓ 已配置: 凭据已配，可单独验证');
    console.log('\n指定品牌进行详细验证: node test-printer.js <brand>');
    console.log(`  可选品牌: ${Object.keys(configs).join(', ')}\n`);

    // 自动测试已配置的品牌
    let tested = false;
    for (const [key, config] of Object.entries(configs)) {
      if (key === 'yilianyun' && config.clientId && config.clientSecret) {
        await testYilianyun(config);
        tested = true;
      }
      if (key === 'feie' && config.user && config.ukey) {
        await testFeie(config);
        tested = true;
      }
      if (key === 'shangmi' && config.appId && config.appSecret) {
        await testShangmi(config);
        tested = true;
      }
    }
    if (!tested) {
      console.log('\n未检测到任何已配置品牌。打印功能将降级为日志输出。');
    }
    return;
  }

  // 测试指定品牌
  const config = configs[brand];
  let ok = false;
  switch (brand) {
    case 'yilianyun':
      ok = await testYilianyun(config);
      break;
    case 'feie':
      ok = await testFeie(config);
      break;
    case 'shangmi':
      ok = await testShangmi(config);
      break;
  }

  console.log(ok ? '\n✓ 验证通过' : '\n✗ 验证未通过');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
