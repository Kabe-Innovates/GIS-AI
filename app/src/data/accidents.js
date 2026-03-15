// Accident data parsed from tn_accidents_500.csv
// Embedded directly for MVP — no backend needed

const CSV_RAW = `acc_id,acc_date,acc_time,district,severity,vehicles,roadtype,weather,lightcond,fatals,injuries,cause,lon,lat
TNACC0001,2024-09-07,08:55,Kancheepuram,Minor,Van,Bypass,Clear,Daylight,0,0,Overspeeding,79.933466,13.024846
TNACC0002,2025-07-28,08:50,Madurai,Major,Truck,State Hwy,Clear,Daylight,0,2,Overspeeding,78.137512,10.08713
TNACC0003,2024-08-08,22:25,Tiruppur,Minor,Truck,National Hwy,Clear,Daylight,0,0,Drunk Driving,77.21269,11.176372
TNACC0004,2025-01-22,06:20,Karur,Major,Auto,City Road,Clear,Night-Lit,0,3,Overspeeding,77.992053,10.983541
TNACC0005,2025-01-24,09:50,Chennai,Major,Car,City Road,Clear,Night-Lit,0,2,Distracted Driving,80.418674,12.892717
TNACC0006,2025-01-23,09:50,Thanjavur,Major,Car,Junction,Clear,Night-Unlit,0,1,Overspeeding,79.125939,10.680101
TNACC0007,2024-08-04,21:45,Krishnagiri,Major,Bus,State Hwy,Clear,Daylight,0,2,Brake Failure,78.156893,12.656854
TNACC0008,2025-08-21,13:45,Madurai,Minor,Car,State Hwy,Clear,Daylight,0,0,Overspeeding,78.115099,9.775942
TNACC0009,2025-03-08,16:30,Coimbatore,Minor,Truck,Bypass,Clear,Night-Lit,0,2,Overspeeding,76.807741,10.864118
TNACC0010,2024-09-30,18:25,Tiruppur,Minor,Truck,State Hwy,Clear,Dawn/Dusk,0,2,Drunk Driving,77.622494,11.355177
TNACC0011,2025-10-02,10:50,Namakkal,Minor,Car,State Hwy,Clear,Daylight,0,0,Animal Crossing,78.33996,11.577564
TNACC0012,2025-01-06,20:20,Dindigul,Minor,Car,Bypass,Cloudy,Daylight,0,0,Brake Failure,77.964261,10.399195
TNACC0013,2024-05-11,17:40,Dharmapuri,Minor,Auto,Bypass,Clear,Daylight,0,2,Animal Crossing,78.177417,11.821669
TNACC0014,2025-11-18,17:35,Tiruppur,Major,Truck,National Hwy,Clear,Daylight,0,2,Overspeeding,77.388107,11.256813
TNACC0015,2025-10-08,05:05,Thoothukudi,Fatal,Bicycle,City Road,Clear,Daylight,2,1,Brake Failure,78.147651,8.832072
TNACC0016,2025-04-29,09:35,Tiruppur,Major,Car,National Hwy,Clear,Daylight,0,1,Pedestrian Crossing,77.556332,11.016185
TNACC0017,2024-03-03,12:25,Cuddalore,Major,Two Wheeler,State Hwy,Clear,Night-Lit,0,3,Wrong Turn,79.61878,11.536822
TNACC0018,2025-03-29,19:40,Erode,Minor,Van,Bypass,Rain,Dawn/Dusk,0,0,Lane Change,77.717696,11.748882
TNACC0019,2025-02-14,21:10,Tirunelveli,Minor,Truck,City Road,Cloudy,Night-Unlit,0,1,Drunk Driving,77.570276,8.725147
TNACC0020,2025-07-23,17:35,Tiruppur,Minor,Bus,State Hwy,Fog,Night-Lit,0,0,Animal Crossing,77.91079,10.951949
TNACC0021,2025-05-03,14:40,Karur,Minor,Auto,National Hwy,Rain,Daylight,0,2,Distracted Driving,78.059535,11.013287
TNACC0022,2025-08-06,09:45,Nagapattinam,Minor,Two Wheeler,Village Road,Clear,Night-Lit,0,1,Poor Visibility,79.853345,10.857276
TNACC0023,2024-09-28,12:50,Coimbatore,Major,Truck,City Road,Cloudy,Dawn/Dusk,0,5,Overspeeding,76.905434,10.925558
TNACC0024,2025-01-13,10:35,Chennai,Major,Van,City Road,Clear,Dawn/Dusk,0,5,Animal Crossing,80.451493,12.914762
TNACC0025,2024-05-17,09:05,Tiruchirappalli,Major,Car,City Road,Clear,Daylight,0,3,Poor Visibility,78.755739,10.767167
TNACC0026,2024-02-22,06:30,Vellore,Major,Two Wheeler,National Hwy,Clear,Daylight,0,4,Drunk Driving,78.743467,12.944639
TNACC0027,2024-04-24,06:55,Thanjavur,Fatal,Auto,National Hwy,Rain,Night-Lit,4,1,Wrong Turn,79.0765,10.564662
TNACC0028,2025-01-01,08:15,Chennai,Major,Bus,Bypass,Cloudy,Daylight,0,2,Road Damage,80.338785,12.854373
TNACC0029,2024-06-30,20:00,Nagapattinam,Minor,Bus,Village Road,Rain,Night-Unlit,0,1,Lane Change,80.013604,11.042007
TNACC0030,2024-02-09,20:15,Coimbatore,Minor,Truck,City Road,Clear,Night-Unlit,0,0,Lane Change,76.969155,10.960977
TNACC0031,2024-10-12,20:20,Chennai,Minor,Auto,Village Road,Clear,Night-Unlit,0,0,Poor Visibility,80.205892,12.980532
TNACC0032,2025-08-17,22:20,Chennai,Minor,Auto,Village Road,Clear,Night-Unlit,0,2,Pedestrian Crossing,80.337567,13.017524
TNACC0033,2024-07-13,09:55,Vellore,Minor,Auto,Bypass,Rain,Dawn/Dusk,0,1,Lane Change,79.4217,13.172846
TNACC0034,2024-12-04,16:50,Tirunelveli,Major,Van,City Road,Clear,Night-Lit,0,3,Poor Visibility,77.935241,8.827089
TNACC0035,2025-01-23,17:10,Thanjavur,Major,Bus,Village Road,Clear,Daylight,0,5,Drunk Driving,79.271019,10.921541
TNACC0036,2025-03-28,17:40,Dindigul,Minor,Bicycle,Junction,Clear,Daylight,0,2,Animal Crossing,77.866833,10.201001
TNACC0037,2024-08-28,17:15,Kancheepuram,Major,Car,National Hwy,Clear,Dawn/Dusk,0,1,Road Damage,79.648544,12.779908
TNACC0038,2024-07-18,18:30,Erode,Minor,Car,State Hwy,Clear,Daylight,0,1,Distracted Driving,77.499246,11.470933
TNACC0039,2025-06-14,14:40,Madurai,Minor,Bicycle,National Hwy,Clear,Night-Unlit,0,2,Animal Crossing,78.255457,10.195149
TNACC0040,2025-03-29,16:55,Dindigul,Major,Truck,Bypass,Clear,Daylight,0,2,Brake Failure,77.85637,10.642706
TNACC0041,2025-06-17,14:15,Villupuram,Minor,Two Wheeler,Junction,Clear,Daylight,0,2,Poor Visibility,79.28715,11.70668
TNACC0042,2024-03-06,12:25,Chennai,Minor,Truck,National Hwy,Clear,Daylight,0,2,Road Damage,80.205894,12.906355
TNACC0043,2025-01-24,14:25,Chennai,Minor,Truck,Village Road,Clear,Night-Lit,0,0,Road Damage,80.39773,12.922564
TNACC0044,2024-01-30,12:50,Vellore,Major,Truck,Junction,Clear,Daylight,1,5,Wrong Turn,79.170076,13.10555
TNACC0045,2025-11-09,01:50,Chennai,Minor,Bicycle,Village Road,Clear,Daylight,0,0,Poor Visibility,80.404663,12.994013
TNACC0046,2025-01-23,09:30,Erode,Minor,Two Wheeler,Village Road,Clear,Night-Lit,0,0,Poor Visibility,77.575754,11.610821
TNACC0047,2024-02-11,18:15,Kancheepuram,Minor,Two Wheeler,Bypass,Clear,Daylight,0,2,Distracted Driving,80.117562,13.023106
TNACC0048,2025-01-12,08:45,Theni,Fatal,Van,National Hwy,Rain,Daylight,1,0,Drunk Driving,77.530002,10.283874
TNACC0049,2025-01-19,12:55,Ramanathapuram,Minor,Auto,Junction,Rain,Daylight,0,2,Drunk Driving,78.752546,9.622083
TNACC0050,2025-08-02,19:25,Dindigul,Minor,Van,City Road,Clear,Night-Lit,0,1,Overspeeding,78.090057,10.065582`;

function parseCSV(csvString) {
    const lines = csvString.trim().split('\n');
    const headers = lines[0].split(',');

    return lines.slice(1).map((line) => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, i) => {
            const val = values[i];
            if (header === 'fatals' || header === 'injuries') {
                obj[header] = parseInt(val, 10);
            } else if (header === 'lon' || header === 'lat') {
                obj[header] = parseFloat(val);
            } else {
                obj[header] = val;
            }
        });
        return obj;
    });
}

// We'll load the full CSV dynamically in main.js via fetch
// For now, parse what we have as fallback
let _accidents = null;
let _summaryCache = null;

export function setAccidents(data) {
    _accidents = data;
    _summaryCache = null;
}

export function getAccidents() {
    return _accidents || [];
}

export function filterBy(field, value) {
    return getAccidents().filter(
        (a) => a[field]?.toLowerCase() === value.toLowerCase()
    );
}

export function filterByMultiple(filters) {
    return getAccidents().filter((a) =>
        Object.entries(filters).every(
            ([field, value]) => a[field]?.toString().toLowerCase() === value.toString().toLowerCase()
        )
    );
}

export function getUniqueValues(field) {
    const vals = new Set(getAccidents().map((a) => a[field]));
    return [...vals].sort();
}

export function summarize() {
    if (_summaryCache) {
        return _summaryCache;
    }

    const data = getAccidents();
    const totalAccidents = data.length;
    const totalFatalities = data.reduce((s, a) => s + a.fatals, 0);
    const totalInjuries = data.reduce((s, a) => s + a.injuries, 0);

    const bySeverity = {};
    const byDistrict = {};
    const byCause = {};
    const byVehicle = {};
    const byRoadType = {};
    const byWeather = {};
    const byLightCond = {};

    data.forEach((a) => {
        bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
        byDistrict[a.district] = (byDistrict[a.district] || 0) + 1;
        byCause[a.cause] = (byCause[a.cause] || 0) + 1;
        byVehicle[a.vehicles] = (byVehicle[a.vehicles] || 0) + 1;
        byRoadType[a.roadtype] = (byRoadType[a.roadtype] || 0) + 1;
        byWeather[a.weather] = (byWeather[a.weather] || 0) + 1;
        byLightCond[a.lightcond] = (byLightCond[a.lightcond] || 0) + 1;
    });

    // Fatal accidents details
    const fatalAccidents = data.filter((a) => a.severity === 'Fatal');
    const fatalByDistrict = {};
    fatalAccidents.forEach((a) => {
        fatalByDistrict[a.district] = (fatalByDistrict[a.district] || 0) + 1;
    });

    _summaryCache = {
        totalAccidents,
        totalFatalities,
        totalInjuries,
        bySeverity,
        byDistrict,
        byCause,
        byVehicle,
        byRoadType,
        byWeather,
        byLightCond,
        fatalCount: fatalAccidents.length,
        fatalByDistrict,
        districts: Object.keys(byDistrict).sort(),
        causes: Object.keys(byCause).sort(),
        vehicleTypes: Object.keys(byVehicle).sort(),
    };

    return _summaryCache;
}

export function parseFullCSV(csvText) {
    return parseCSV(csvText);
}
