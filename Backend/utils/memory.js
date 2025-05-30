const logMemoryUsage=(label='') =>{
    const used = process.memoryUsage();
    console.log(`[Memory ${label}]
     heapUsed: ${(used.heapUsed/1024/1024).toFixed(2)} MB`);
}

module.exports = {logMemoryUsage}