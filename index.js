const yaml = require('js-yaml');
const archiver =  require('archiver');
const got = require('got');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const FormData = require('form-data');

const defaultConfig = {
  // dsn: '',
  context: 'dist',
  output: 'dist.zip',
  compress: 'zip', // zip, tar
};

(async () => {
  try {
    // 读取配置文件
    const yamlPath = path.resolve(__dirname, 'deploy.yaml');
    await fsp.access(yamlPath);
    const stats = await fsp.stat(yamlPath);
    if (!stats.isFile()) {
      throw new Error('deploy.yaml is not a file');
    }
    const yamlConfig = yaml.load(await fsp.readFile(yamlPath, 'utf8'));
    const config = Object.assign({}, defaultConfig, yamlConfig);
    if (!config.dsn) {
      throw new Error('dsn is required');
    }
    // 输出配置兜底处理
    let [outputFileName, outputFileSuffix] = config.output.split('.');
    if (!['zip', 'tar'].includes(config.compress)) {
      config.compress = 'zip';
    }
    if (!outputFileName) {
      outputFileName = 'dist';
    }
    if (outputFileSuffix) {
      if (['zip', 'tar'].includes(outputFileSuffix)) {
        config.compress = outputFileSuffix;
      } else {
        outputFileSuffix = config.compress;
      }
    } else {
      outputFileSuffix = config.compress;
    }
    config.output = `${outputFileName}.${outputFileSuffix}`;


    // 压缩文件
    const contextPath = path.resolve(__dirname, config.context);
    const compressFilePath = path.resolve(__dirname, config.output);

    const compressFileOutput = fs.createWriteStream(compressFilePath);
    const archive = archiver(config.compress, {
      zlib: { level: 9 },
    });

    compressFileOutput.on('close', () => {
      console.log(`${compressFilePath}: ${archive.pointer()} total bytes`);
    });
    compressFileOutput.on('end', () => {
      console.log('Data has been drained');
    });

    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') {
        // log warning
        console.warn(error);
      } else {
        // throw error
        throw error;
      }
    });
    archive.on('error', (error) => {
      throw error;
    });

    // pipe archive data to the file
    archive.pipe(compressFileOutput);
    // add compressed folder
    archive.directory(contextPath, false);
    // execute compress
    archive.finalize();


    // 发送文件
    const form = new FormData();
    form.append('file', fs.createReadStream(compressFilePath));
    await got.post(config.dsn, {
      body: form,
    });
    console.log('发送压缩文件完成');
  } catch (error) {
    console.log(error);
  }
})();

process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error.message);
  process.exitCode = 1;
});
