const HEX = {
  ab2hex(buffer) {
    const hexArr = Array.prototype.map.call(new Uint8Array(buffer), (bit) => {
      return ('00' + bit.toString(16)).slice(-2);
    });
    return hexArr.join('');
  },

  hex2ab(str) {
    const bytes = new Uint8Array(str.length / 2);
    for (let i = 0; i < str.length; i += 2) {
      bytes[i / 2] = parseInt(str.substr(i, 2), 16);
    }
    return bytes.buffer;
  },

  ab2str(buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
  },

  str2ab(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes.buffer;
  },
};

const _openBluetoothAdapter = () => {
  return new Promise(function (resolve, reject) {
    uni.closeBluetoothAdapter({
      fail: reject,
      complete() {
        uni.openBluetoothAdapter({
          success: resolve,
          fail: reject,
        });
      },
    });
  });
};

const _createBLEConnection = (deviceId) => {
  return new Promise(function (resolve, reject) {
    uni.createBLEConnection({
      deviceId,
      success: resolve,
      fail: reject,
    });
  });
};

const _getBLEDeviceServices = (deviceId) => {
  return new Promise(function (resolve, reject) {
    uni.getBLEDeviceServices({
      deviceId,
      success: (res) => {
        for (let i = 0; i < res.services.length; i++) {
          let service = res.services[i];
          if (service.uuid.startsWith('0000FF00')) {
            resolve(service);
            return;
          }
        }
        resolve();
      },
      fail: reject,
    });
  });
};

const _getBLEDeviceCharacteristics = (deviceId, serviceId) => {
  return new Promise(function (resolve, reject) {
    uni.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (res) => {
        let characteristics = {};
        for (let i = 0; i < res.characteristics.length; i++) {
          let item = res.characteristics[i];
          if (item.properties.notify) {
            characteristics.notify = characteristics.notify || item;
          }
          if (item.properties.write) {
            characteristics.write = characteristics.write || item;
          }
          if (item.uuid.startsWith('0000FF03')) {
            characteristics.dataFC = characteristics.dataFC || item;
          }
        }
        resolve(characteristics);
      },
      fail: reject,
    });
  });
};

const _wxWriteBLECharacteristicValue = ({ deviceId, serviceId, characteristicId, value }) => {
  return new Promise(function (resolve, reject) {
    uni.writeBLECharacteristicValue({
      deviceId,
      serviceId,
      characteristicId,
      value,
      writeType: 'writeNoResponse',
      success: function () {
        resolve(true);
      },
      fail: function (e) {
        console.log(e);
        if (e.code == 10007) {
          resolve(false);
        } else {
          reject(e);
        }
      },
    });
  });
};

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

const _writeBLECharacteristicValue = async (deviceId, serviceId, characteristicId, value, mtu) => {
  mtu = mtu || (uni.getSystemInfoSync().platform === 'ios' ? 10000 : 20);
  const total = value.byteLength;
  let num = 0;
  let count = 0;
  while (count < total) {
    const element = value.slice(count, count + mtu);
    if (element.byteLength === 0) break;
    let writeResult = await _wxWriteBLECharacteristicValue({
      deviceId,
      serviceId,
      characteristicId,
      value: element,
    });
    if (writeResult) {
      count = count + element.byteLength;
      num++;
    }
  }
  return num;
};

const _writeBLECharacteristicValueWithDataFC = async (device, value) => {
  const total = value.byteLength;
  let num = 0;
  let count = 0;
  const dataFC = device.dataFC;
  while (count < total) {
    if (dataFC.mtu > 0 && dataFC.credit > 0) {
      const subData = value.slice(count, count + dataFC.mtu - 3);
      if (subData.byteLength === 0) break;
      count = count + subData.byteLength;
      dataFC.credit--;
      while (!(await _wxWriteBLECharacteristicValue({
        deviceId: device.deviceId,
        serviceId: device.serviceId,
        characteristicId: device.writeCharacteristicId,
        value: subData,
      }))) {
        await sleep(100);
      }
      num++;
    } else {
      await sleep(0);
    }
  }
  return num;
};

const find = (onBluetoothDeviceFound) => {
  _openBluetoothAdapter().then(function () {
    uni.onBluetoothDeviceFound(function (res) {
      if (onBluetoothDeviceFound) {
        onBluetoothDeviceFound(res);
      }
    });
    uni.startBluetoothDevicesDiscovery();
  });
};

const connect = async ({
  deviceId,
  onBLEConnectionStateChange,
  onBLECharacteristicValueChange,
  onDataFCValueChange,
}) => {
  let device = {
    connected: false,
    deviceId: deviceId,
    serviceId: '',
    notifyCharacteristicId: '',
    writeCharacteristicId: '',
    dataFCCharacteristicId: '',
    onBLEConnectionStateChange,
    onBLECharacteristicValueChange,
    onDataFCValueChange,
    dataFC: {
      mtu: 0,
      credit: 0,
    },
  };

  await _openBluetoothAdapter().then(function () {
    return new Promise((resolve, reject) => {
      uni.onBLEConnectionStateChange(function (res) {
        device.connected = res.connected;
        if (device.onBLEConnectionStateChange) {
          device.onBLEConnectionStateChange(res);
        }
        if (res.connected) {
          resolve(res);
        } else {
          reject(res);
        }
      });
      _createBLEConnection(deviceId);
    });
  }).then(async function () {
    await sleep(1000);
    let service = await _getBLEDeviceServices(deviceId);
    if (!service) {
      await sleep(2000);
      service = await _getBLEDeviceServices(deviceId);
    }
    if (!service) {
      return Promise.reject('获取service失败');
    } else {
      return service;
    }
  }).then(function (service) {
    device.serviceId = service.uuid;
    return _getBLEDeviceCharacteristics(device.deviceId, device.serviceId);
  }).then(function (characteristics) {
    device.notifyCharacteristicId = characteristics.notify ? characteristics.notify.uuid : '';
    device.writeCharacteristicId = characteristics.write ? characteristics.write.uuid : '';
    device.dataFCCharacteristicId = characteristics.dataFC ? characteristics.dataFC.uuid : '';
  }).catch(function (err) {
    console.log(err);
  });

  if (uni.getSystemInfoSync().platform === 'android' || uni.getSystemInfoSync().platform === 'ohos') {
    await new Promise(function (resolve) {
      uni.setBLEMTU({
        deviceId: deviceId,
        mtu: 512,
        success(res) {
          resolve();
        },
        fail() {
          resolve();
        },
        complete() {
          resolve();
        },
      });
    });
    await sleep(500);
  }

  uni.onBLECharacteristicValueChange(function (res) {
    if (res.characteristicId === device.notifyCharacteristicId) {
      device.onBLECharacteristicValueChange && device.onBLECharacteristicValueChange(res);
    }
    if (res.characteristicId === device.dataFCCharacteristicId) {
      const data = new Uint8Array(res.value);
      const flag = data[0];
      if (flag === 1) {
        device.dataFC.credit += data[1];
      } else if (flag === 2) {
        device.dataFC.mtu = (data[2] << 8) + data[1];
      }
      device.onDataFCValueChange && device.onDataFCValueChange(res);
    }
  });

  if (device.notifyCharacteristicId) {
    await new Promise(function (resolve, reject) {
      uni.notifyBLECharacteristicValueChange({
        state: true,
        deviceId: device.deviceId,
        serviceId: device.serviceId,
        characteristicId: device.notifyCharacteristicId,
        success: resolve,
        fail: reject,
      });
    });
  }

  if (device.dataFCCharacteristicId) {
    await sleep(500);
    await new Promise(function (resolve, reject) {
      uni.notifyBLECharacteristicValueChange({
        state: true,
        deviceId: device.deviceId,
        serviceId: device.serviceId,
        characteristicId: device.dataFCCharacteristicId,
        success: resolve,
        fail: reject,
      });
    });
  }

  device.write = async (value) => {
    if (device.writeCharacteristicId && device.dataFCCharacteristicId) {
      await _writeBLECharacteristicValueWithDataFC(device, value);
    } else if (device.writeCharacteristicId) {
      await _writeBLECharacteristicValue(device.deviceId, device.serviceId, device.writeCharacteristicId, value, 512);
    }
  };

  device.close = () => {
    uni.closeBLEConnection({
      deviceId: device.deviceId,
    });
  };

  return device;
};

export { HEX, find, connect };
