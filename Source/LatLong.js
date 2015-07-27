/**
 * Constructs a new LatLong geographic location 
 * 
 * @param {number} latitude - The latitude in degrees (-180° to 180°)
 * @param {number} longitude - The longitude in degrees (-180° to 180°)
 * @param {string} [description] - The label or name of this location
 * @param {string} [color] - A CSS color (if this location needs a special color)
 * @param {number} [expirationTime] - An optional time to remove the location. Compared against (new Date()).getTime().
 * @constructor
 */
function LatLong(latitude, longitude, description, color, expirationTime)
{
	"use strict";
	this.latitude = LatLong.parseLatOrLong(latitude); // Horizontal lines, like the equator
	this.longitude = LatLong.parseLatOrLong(longitude); // Vertical lines
	this.description = description || "";
	this.color = color;
	this.expiration = expirationTime;
	this.isDead = false;
	this.details = null;
}

/**
 * Returns the location as a string with rounded degrees (e.g.: -17°, 43°).
 */
LatLong.prototype.toStringShort = function()
{
	"use strict";
	var latNorm = Math.round(LatLong.normalizeLatLong(this.latitude));
	var longNorm = Math.round(LatLong.normalizeLatLong(this.longitude));
	var ret = latNorm + "\u00B0 " + longNorm + "\u00B0";
	if (this.description)
		ret += ": " + this.description;
	return ret;
};

/**
 * Returns the location as a string with decimal degrees (e.g.: -17.5446421°, 43.24665041°).
 */
LatLong.prototype.toString = function()
{
	"use strict";
	var latNorm = LatLong.normalizeLatLong(this.latitude);
	var longNorm = LatLong.normalizeLatLong(this.longitude);
	var ret = latNorm + "\u00B0 " + longNorm + "\u00B0";
	if (this.description)
		ret += ": " + this.description;
	return ret;
};

/**
 * Returns the location as a string with rounded degrees (e.g.: lat: 17° S, long: 43° E).
 */
LatLong.prototype.toStringDmsShort = function()
{
	"use strict";
	var latNorm = Math.round(LatLong.normalizeLatLong(this.latitude));
	var ret = "lat: " + LatLong.latOrLongToString(latNorm, "N", "S");
	ret += ", long: ";
	var longNorm = Math.round(LatLong.normalizeLatLong(this.longitude));
	ret += LatLong.latOrLongToString(longNorm, "E", "W");
	if (this.description)
		ret += ", Description: " + this.description;
	return ret;
};

/**
 * Returns the location as a string with degrees, minutes, seconds format (e.g.: latitude: 17° 34' 12" S, longitude: 43° 12' 54" E).
 */
LatLong.prototype.toStringDms = function()
{
	"use strict";
	var latNorm = LatLong.normalizeLatLong(this.latitude);
	var ret = "latitude: " + LatLong.latOrLongToString(latNorm, "N", "S");
	ret += ", longitude: ";
	var longNorm = LatLong.normalizeLatLong(this.longitude);
	ret += LatLong.latOrLongToString(longNorm, "E", "W");
	if (this.description)
		ret += ", Description: " + this.description;
	return ret;
};

/**
 * Converts this location to x and y coordinates on an equirectangular map
 * 
 * @param {number} mapWidth - The width of the equirectangular map
 * @param {number} mapHeight - The height of the equirectangular map
 */
LatLong.prototype.toEquirectangular = function(mapWidth, mapHeight)
{
	"use strict";
	return new Point(
		LatLong.longitudeToX_equirectangular(this.longitude, mapWidth),
		LatLong.latitudeToY_equirectangular(this.latitude, mapHeight));
};

/**
 * Normalizes the latitude and longitude to -180° to +180° range.
 */
LatLong.prototype.normalize = function()
{
	this.latitude = LatLong.normalizeLatLong(this.latitude);
	this.longitude = LatLong.normalizeLatLong(this.longitude);
};

/**
 * Returns the degrees normalized to the -180° to +180° range.
 */
LatLong.normalizeLatLong = function(degrees)
{
	"use strict";
	degrees = ((degrees % 360) + 360) % 360;
	if (degrees > 180)
		degrees -= 360;
	return degrees;
};

/**
 * Returns the degrees as a string in degrees, minutes, seconds format (e.g.: 17° 34' 12" S).
 *
 * @param {number} degrees - The degrees to convert to a string
 * @param {string} posSuffix - The suffix for positive degrees (usually "N" for latitude, and "E" for longitude)
 * @param {string} negSuffix - The suffix for negative degrees (usually "S" for latitude, and "W" for longitude)
 */
LatLong.latOrLongToString = function(degrees, posSuffix, negSuffix)
{
	"use strict";
	var suffix;
	if (degrees < 0)
	{
		degrees = -degrees;
		suffix = negSuffix;
	}
	else
	{
		suffix = posSuffix;
	}
	var rounded = Math.round(degrees * 3600) / 3600;
	var deg = Math.floor(rounded);
	var minSec = (rounded - deg) * 60;
	var min = Math.floor(minSec);
	var sec = Math.floor((minSec - min) * 60);
	if (min === 0 && sec === 0)
		return deg + "\u00B0 " + suffix;
	else if (sec === 0)
		return deg + "\u00B0 " + min + "' " + suffix;
	return deg + "\u00B0 " + min + "' " + sec + '" ' + suffix;
};

/**
 * Parses a single latitude or longitude coordinate as a number, recognizing N or S as negative degrees.
 * Does not parse minutes or seconds as separate numbers
 */
LatLong.parseLatOrLong = function(degrees)
{// TODO: Degrees, minutes, seconds
	"use strict";
	if (typeof degrees === "number")
		return degrees;
	var str = String(degrees).toLowerCase();
	var isNeg = str.indexOf("s")  > -1|| str.indexOf("w") > -1;
	str = str.replace("/[news\u00B0 ]/g", "");
	var num = parseFloat(str);
	if (num > 0 && isNeg)
		num = -num;
	return num;
};

/**
 * Returns a new LatLong object from the given coordinates on an equirectangular map
 * 
 * @param {number} xCoord - The x-coordinate of this location on an equirectangular map
 * @param {number} yCoord - The y-coordinate of this location on an equirectangular map
 * @param {number} mapWidth - The width of the equirectangular map
 * @param {number} mapHeight - The heigh of the equirectangular map
 * @param {string} [description] - A label or name for this location
 */
LatLong.fromEquirectangularCoords = function(xCoord, yCoord, mapWidth, mapHeight, description)
{
	"use strict";
	return new LatLong(
		LatLong.yToLatitude_equirectangular(yCoord, mapHeight),
		LatLong.xToLongitude_equirectangular(xCoord, mapWidth),
		description);
};

/** 
 * Converts a latitude measurement in degrees to a y-coordinate on an equirectangular map
 * 
 * @param {number} latDeg - The latitude in degrees (-180° to 180)
 * @param {number} mapHeight - The map height
 */
LatLong.latitudeToY_equirectangular = function(latDeg, mapHeight)
{
	"use strict";
	var zeroToOne = (90 - latDeg) / 180;
	return zeroToOne * mapHeight;
};

/**
 * Converts a y-coordinate on an equirectangular map to a latitude in degrees (-180° to 180)
 * 
 * @param {number} yCoord - The y-coordinate on the equirectangular map
 * @param {number} mapHeight - The height of the map
 */
LatLong.yToLatitude_equirectangular = function(yCoord, mapHeight)
{
	"use strict";
	return 90 - (yCoord / mapHeight) * 180;
};

/**
 * Converts a longitude measurement in degrees to an x-coordinate on an equirectangular map
 * 
 * @param {number} longDeg - The longitude in degrees (-180° to 180°)
 * @param {number} mapWidth - The map width
 */
LatLong.longitudeToX_equirectangular = function(longDeg, mapWidth)
{
	"use strict";
	var zeroToOne = (longDeg + 180) / 360;
	return zeroToOne * mapWidth;
};

/**
 * Converts an x-coordinate on an equirectangular map to a longitude in degrees (-180° to 180°)
 * 
 * @param {number} xCoord - The x-coordinate on the equirectangular map
 * @param {number} mapWidth - The map width
 */
LatLong.xToLongitude_equirectangular = function(xCoord, mapWidth)
{
	"use strict";
	return (xCoord / mapWidth) * 360 - 180;
};


/**
 * Returns a new Point object with x and y coordinates
 * @constructor
 */
function Point(x, y)
{
	"use strict";
	this.x = x;
	this.y = y;
}
