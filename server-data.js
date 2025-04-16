let latestMoistureData = { moisture1: 0, moisture2: 0, moisture3: 0, average: 0 };

function updateMoisture(data) {
    latestMoistureData = data;
}

function getLatestMoisture() {
    return latestMoistureData;
}

module.exports = { updateMoisture, getLatestMoisture };
