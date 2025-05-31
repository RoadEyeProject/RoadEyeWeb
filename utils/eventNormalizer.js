const normalizeEventType = (detectedClass) => {
    switch (detectedClass) {
        case "Arrow Board":
        case "Traffic Cones":
            return "Road Construction";
        case "Police Car":
        case "Accident":
            return detectedClass;
        default:
            return null;
    }
};

module.exports = { normalizeEventType };
