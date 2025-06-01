const normalizeEventType = (detectedClass) => {
    switch (detectedClass) {
        case "Arrow Board":
        case "Traffic Cones":
            return "Road Construction";
        case "police car":
        case "Accident":
            return detectedClass;
        default:
            return null;
    }
};

module.exports = { normalizeEventType };
