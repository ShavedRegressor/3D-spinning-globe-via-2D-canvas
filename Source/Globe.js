/**
 * Constructs a Globe object that renders in 3D with standard 2D canvas contexts and no 3D libraries.
 * 
 * The required image property of the options parameter is either the img itself, or the ID of the img.
 * The image must be a Lambert projection for correct rendering. The ideal image resolution would
 * have a height equal to the diameter, and a width equal to the diameter × pi. If the image isn’t specified
 * or can’t be loaded, then a simple clip-art style texture will be used instead.
 * 
 * @param {object} [options]
 *      @param {string|HTMLElement} options.div - The container element in which to put the globe, either as a string ID or the actual element
 *      @param {number} [options.diameter=256] - The diameter of the globe
 *      @param {string|HTMLElement} [options.image] - Image element or ID of image element. See details in the function description above.
 * 			 If omitted or not found, a simple clip-art style texture will be used intead. An ideal image should have a height equal to the globe diameter, and a width 
 *      @param {number} [options.horizontalMargin=0] - Margin to left and right of globe
 *      @param {number} [options.verticalMargin=0] - Margin to top and bottom of globe
 *      @param {boolean} [options.shading=true] - True to put mild shading on the globe
 *      @param {string} [options.locationColor="#F00"] - The color of location dots and text
 *      @param {number} [options.textShiftDown=0.5] - The vertical text positioning adjustment, relative to the text height.
 *      @param {boolean} [options.interactive=true] = Controls whether the user can spin the globe with a mouse
 * @constructor
 */
function Globe(options)
{
	"use strict";
	options = options || {};
	this.size = options.diameter || 256;
	this.textShiftDown = options.textShiftDown == null ? 0.5 : options.textShiftDown;
	this.locations = [];
	this.dotRadius = 3;
	this.xOffset = options.horizontalMargin || 0;
	this.yOffset = options.verticalMargin || 0;
	this.div = typeof options.div === "string" ? document.getElementById(options.div) : options.div;
	if (!this.div)
		throw options.div ? "Element specified for div not found" : "Required div property not specified in options"
	var totalWidth = this.size + this.xOffset * 2;
	var totalHeight = this.size + this.yOffset * 2;

	var canvasesText = '<canvas id="cglobBack" width="' + totalWidth + '" height="' + totalHeight + '" style="position: absolute; left: 0; top: 3; z-index: 0;"></canvas>' +
		'<canvas id="cglobMid" width="' + totalWidth + '" height="' + totalHeight + '" style="position: absolute; left: 0; top: 30; z-index: 1;"></canvas>';
	if (options.shading !== false)
		canvasesText += '<canvas id="cglobShading" width="' + totalWidth + '" height="' + totalHeight + '" style="position: absolute; left: 0; top: 30; z-index: 2;"></canvas>';
	canvasesText += '<canvas id="cglobFore" width="' + totalWidth + '" height="' + totalHeight + '" style="position: absolute; left: 0; top: 30; z-index: 2;"></canvas>';
	this.div.innerHTML = canvasesText;

	this.canvas = document.getElementById("cglobMid");
	this.canvas.removeAttribute("id");

	this.canvasUnder = document.getElementById("cglobBack");
	this.canvasUnder.removeAttribute("id");

	this.canvasOver = document.getElementById("cglobFore");
	this.canvasOver.removeAttribute("id");

	if (options.shading)
	{
		this.canvasShading = document.getElementById("cglobShading");
		var globRad = this.size / 2;
		this._drawShading(this.canvasShading, this.xOffset + globRad, this.yOffset + globRad, globRad);
	}

	this.g = this.canvas.getContext("2d");
	this.g.fillStyle = options.locationColor || "#F00";
	this.gOver = this.canvasOver ? this.canvasOver.getContext("2d") : null;
	if (this.gOver)
		this.gOver.fillStyle = options.locationColor || "#F00";
	this.overDirty = false;
	this.underDirty = false;
	this.gUnder = this.canvasUnder ? this.canvasUnder.getContext("2d") : null;
	if (this.gUnder)
		this.gUnder.fillStyle = options.locationColor || "#F00";
	this.globePixels = this.g.getImageData(0, 0, this.size, this.size);
	if (typeof options.image === "string")
		this.lambertImage = document.getElementById(options.image);
	else
		this.lambertImage = options.image;
	this.usedImage = null;
	this.offsets = null;
	this.offsetRowsStarts = null;
	this.offsetRowsLengths = null;
	this.lambertImagePixels = null;
	this.lambertImageWidth = null;
	this.lambertImageHeight = null;
	this.degreesRotation = 0;
	var self = this;
	this.mouseXlast = null;
	this.mouseXlastTimeMs = null;
	this.mouseXlastLast = null;
	this.mouseXlastLastTimeMs = null;
	this.mouseDown = false;
	this.interactive = options.interactive !== false;
	var topCanvas = this.canvasOver || this.canvas;
	Globe.addEvent(topCanvas, "mousedown", function(e) {self._handleMousedown(e);});
	Globe.addEvent(topCanvas, "mousemove", function(e) {self._handleMousemove(e);});
	Globe.addEvent(document, "mouseup", function(e) {self._handleMouseup(e);});
	
	this.spinDegreesPerSecond = 0;
	this.spinDegreesFrictionPerSecond = 0;
	this.animFrameRequest = 0;
	this.spinLastFrameUtcMs = null;
	this.locations = []; // Labeled locations (LatLong objects)
	this.dotColor = options.locationColor || "#F00";

	this.expireLocCount = 0; // The number of LatLong objects that will expire
	this.spinSetCallback = null; // An optional callback triggered by a Spin call or spin finish

	this.draw();
}

/**
 * Adds an event handler using either attachEvent or addEventListener.
 */
Globe.addEvent = function(elem, eventName, callback)
{
	if (elem.attachEvent)
		elem.attachEvent("on" + eventName, callback);
	else
		elem.addEventListener(eventName, callback, false);
};

/**
 * Draws simple shading for a globe overlay
 */
Globe.prototype._drawShading = function(canvas, centerX, centerY, radius)
{
	if (canvas)
	{
		var g = canvas.getContext("2d");
		var spotX = centerX - radius*0.6;
		var spotY = centerY - radius*0.4;
		var grad = g.createRadialGradient(spotX, spotY, 1, spotX, spotY, radius * 1.8);
		grad.addColorStop(0, "rgba(255,255,255,0.12)");
		grad.addColorStop(0.5, "rgba(255,255,255,0)");
		grad.addColorStop(0.7, "rgba(0,0,0,0)");
		grad.addColorStop(1, "rgba(0,0,0,0.6)");
		g.fillStyle = grad;
		g.arc(centerX, centerY, radius, Math.PI*2, false);
		g.fill();

	}
};

/**
 * Adds a single location to the globe.
 * Either a single LatLong parameter can be passed, or individual parameters can be used.
 * 
 * @param {number|LatLong} latitudeOrLatLong - Either a LatLong object as the only paramter, or the latitude in degrees if more parameters follow
 * @param {number} [longitude] - The longitude
 * @param {string} [description] - The label for the location
 * @param {string} [color] - An optional CSS color 
 * @param {number} [expiry] - An optional expiration time, to compare against (new Date()).getTime().
 * @return {LatLong}
 */
Globe.prototype.addLocation = function(latitudeOrLatLong, longitude, description, color, expiry)
{
	var latLong = longitude == null ? latitudeOrLatLong : new LatLong(latitudeOrLatLong, longitude, description, color, expiry);
	
	this.locations.push(latLong);
	if (latLong.expiration)
		this.expireLocCount++;
	if (!this.spinDegreesPerSecond)
		this.draw();
		
	return latLong;
};

/**
 * Adds multiple locations to the glove from the specified array of LatLong objects.
 * 
 * @param {LatLong[]} latLongs - An array of LatLongs to add
 */
Globe.prototype.addLocations = function(latLongs)
{
	var addExpires = 0;
	for (var i = 0, len = latLongs.length; i < len; ++i)
	{
		if (latLongs[i].expiration)
			++addExpires;
	}
	if (this.locations.length)
	{
		this.locations = this.locations.concat(latLongs);
		this.expireLocCount += addExpires;
	}
	else
	{
		this.locations = latLongs.slice();
		this.expireLocCount = addExpires;
	}
	this.draw();
};

/**
 * Clears and pre-existing locations from the globe, and adds the locations in the specifiec LatLong array.
 * 
 * @param {LatLong[]} latLongs - The array of LatLongs to add
 */
Globe.prototype.setLocations = function(latLongs)
{
	this.locations = [];
	this.expireLocCount = 0;
	this.addLocations(latLongs);
};

/**
 * Removes a single LatLong from the globe
 */
Globe.prototype.removeLocation = function(latLong)
{
	var index = this.locations.indexOf(latLong);
	if (index > -1)
	{
		this.locations.splice(index, 1);
		if (latLong.expiration)
			this.expireLocCount--;
	}
	this.draw();
};

/**
 * Removes all LatLongs from the globe
 */
Globe.prototype.clearLocations = function()
{
	this.locations.splice(0, this.locations.length);
	this.expireLocCount = 0;
	this.draw();
};

/**
 * Converts a latitude/longitude to pixel coordinates for the drawn globe.
 *
 * @param latitudeOrLatLong The latitude degrees as a number, or a LatLong object
 * @param longitudeOrNothing The longitude degrees as a number (ignored if the first parameter is not a number)
 * @return Object with .x and .y pixel coordinates, and .foreground true or false
 */
Globe.prototype.getXYCoordinates = function(latitudeOrLatLong, longitudeOrNothing)
{
	// Fix parameters
	var latitude;
	var longitude;
	if (typeof latitudeOrLatLong === "number")
	{
		latitude = latitudeOrLatLong;
		longitude = longitudeOrNothing;
	}
	else
	{
		latitude = latitudeOrLatLong.latitude;
		longitude = latitudeOrLatLong.longitude;
	}
	latitude = Globe.mod(latitude, 360);
	if (latitude > 180)
		latitude -= 360;

	longitude = Globe.mod(longitude - this.degreesRotation, 360);
	if (longitude > 180)
		longitude -= 360;

	var radius = this.size / 2;

	// y
	var yrad = (latitude / 180) * Math.PI;
	var yCoord = (-Math.sin(yrad)) * radius + radius + this.yOffset;

	// x
	var xrad = (longitude / 180) * Math.PI;
	var xmult = Math.abs(Math.cos(yrad));
	var xRel = Math.sin(xrad);
	var xCoord = xRel * xmult * radius + radius + this.xOffset;


	var isForeground = longitude >= -90 && longitude <= 90;

	return {x:xCoord, y:yCoord, foreground:isForeground, xRel:xRel, latitude:latitude, longitude:longitude};
};

/**
 * Converts pixel coordinates to a LatLong object (with .latitude and .longitude properties).
 *
 * @param {number} canvasX - The horizontal pixel coordinate, relative to the drawing canvas.
 * @param {number} canvasY - The vertical pixel coordinate, relative to the drawing canvas.
 * @param {string} [description] - An optional description to apply to any returned LatLong object
 * @return {LatLong}
 */
Globe.prototype.getLatLong =function(canvasX, canvasY, description)
{
	"use strict";
	// latitude
	var y = 1 - (canvasY - this.yOffset) / (this.size / 2); // 1 to -1 (1 at north pole)
	if (y < -1 || y > 1)
		return null; // Not on globe
	var latitude = (Math.asin(y) / Math.PI) * 180;
	if (isNaN(latitude))
		return null; // Not on globe
	// calc longitude (as if globe were positioned with prime meridian facing the screen)
	var x = (canvasX - this.xOffset) / (this.size / 2) - 1; // -1 to 1 (1 to east)
	if (x < -1 || x > 1)
		return null; // Not on globe
	var xRelSize = Math.sqrt(1 - y * y);
	if (xRelSize <= 0 || xRelSize > 1)
		return null; // Not on globe
	x /= xRelSize;
	if (x < -1 || x > 1)
		return null; // Not on globe
	var longitude = (Math.asin(x) / Math.PI) * 180;
	// Now adjust longitude for globe rotation
	longitude += this.degreesRotation;
	longitude = Globe.mod(longitude, 360); // 0 to 360 range
	if (longitude > 180)
		longitude -= 360;
	if (isNaN(longitude))
		return null; // Not on globe
	return new LatLong(latitude, longitude, description);
};

/**
 * Returns whether or not the globe is spinning.
 * 
 * @return {boolean}
 */
Globe.prototype.isSpinning = function()
{
	return !!this.spinDegreesPerSecond;
};

/**
 * Immediately stops any globe spinning.
 */
Globe.prototype.stop = function()
{
	this.spin();
}

/**
 * Starts the globe spinning. The globe will continue to spin until stopped by the user or by friction.
 *
 * @param {number} [degreesPerSecond=0] - Positive rotates right (west to east), as the Earth spins in space. Real-time rotation would be 360/(60*60*24).
 * @param {number} [frictionDegreesPerSecond=0] - How much the speed slows per second. Sign (+/-) does not matter.
 */
Globe.prototype.spin = function(degreesPerSecond, frictionDegreesPerSecond)
{
	"use strict";

	degreesPerSecond = degreesPerSecond ? -degreesPerSecond : 0;
	this.spinDegreesPerSecond = degreesPerSecond;
	if (frictionDegreesPerSecond)
	{
		if (Globe.differentSign(frictionDegreesPerSecond, degreesPerSecond))
			frictionDegreesPerSecond = -frictionDegreesPerSecond;
		this.spinDegreesFrictionPerSecond = frictionDegreesPerSecond;
	}
	else
	{
		this.spinDegreesFrictionPerSecond = 0;
	}
	this.spinLastFrameUtcMs = (new Date()).getTime();
	this.draw();
	if (this.spinSetCallback)
		this.spinSetCallback(degreesPerSecond, this.spinDegreesFrictionPerSecond);
};

/**
 * Called by a timer for spin animation
 */
Globe.prototype._updateSpin = function(nowUtcMs)
{
	"use strict";
	var secondsPassed = (nowUtcMs - this.spinLastFrameUtcMs) / 1000;

	this.degreesRotation += this.spinDegreesPerSecond * secondsPassed;
	if (this.spinDegreesFrictionPerSecond)
	{
		var thisDrag = this.spinDegreesFrictionPerSecond * secondsPassed;
		var newSpin = this.spinDegreesPerSecond - thisDrag;
		if (Globe.differentSign(newSpin, this.spinDegreesPerSecond))
			this.spin(0);
		else
			this.spinDegreesPerSecond = newSpin;
	}

	this.degreesRotation %= 360;
	this.spinLastFrameUtcMs = nowUtcMs;
	//this.draw(nowUtcMs);
};

Globe.differentSign = function(a, b)
{
	return (a > 0) !== (b > 0);
};

Globe.prototype._handleMousedown = function(e)
{
	"use strict";
	var rect = this.canvas.getBoundingClientRect();
	var x = e.clientX - rect.left;
	var y = e.clientY - rect.top;
	
	if (this.getLatLong(x, y))
	{
		this.mouseDown = true;
		if (this.interactive)
			this.spin(0);
		this._handleMousemove(e);
	}
};

Globe.prototype._handleMousemove = function(e)
{
	"use strict";
	if (this.interactive && this.mouseDown && this.mouseXlast !== null)
	{
		var delta = this.mouseXlast - e.pageX;
		delta *= 135 / this.size;
		this.degreesRotation += delta;
		this.draw();
	}
	this.mouseXlastLast = this.mouseXlast;
	this.mouseXlastLastTimeMs = this.mouseXlastTimeMs;
	this.mouseXlast = e.pageX;
	this.mouseXlastTimeMs = new Date().getTime();
};

Globe.prototype._handleMouseup = function(e)
{
	"use strict";
	if (this.mouseDown)
	{
		this.mouseDown = false;
		if (this.interactive && this.mouseXlastLast !== null && this.mouseXlastLastTimeMs !== null) {
			var msPassed = new Date().getTime() - this.mouseXlastLastTimeMs;
			var deg = e.pageX - this.mouseXlastLast;
			deg *= 135 / this.size;
			var degPerSec = deg / (msPassed / 1000);
			degPerSec *= 0.35; // Not too fast.
			if (degPerSec < -630)
				degPerSec = -630;
			else if (degPerSec >= 630)
				degPerSec = 630;
			this.spin(degPerSec, 128);
		}
	}
};

/**
 * Sets the globe offsets array, preparing it for drawing.
 */
Globe.prototype.initialize = function()
{
	"use strict";
	var thisSize = this.size;
	var gPixelsData = this.globePixels.data;
	this.lambertImageWidth = (this.lambertImage && this.lambertImage.naturalWidth) || 768;
	this.lambertImageHeight = (this.lambertImage && this.lambertImage.naturalHeight) || 256;
	this.calcOffsets();
	var pixResult = Globe.getPixels(this.lambertImage, this.lambertImageWidth, this.lambertImageHeight);
	this.lambertImagePixels = pixResult.data;
	this.usedImage = pixResult.image;
	// Stamp alpha
	var maxDist = thisSize / 2;
	for (var y = 0; y < thisSize; ++y)
	{
		var yDistSquared = y - maxDist;
		yDistSquared *= yDistSquared;
		var offsetRow = this.offsets[y];
		var offset = y * thisSize * 4 + 3;
		for (var x = 0; x < thisSize; ++x)
		{
			if (isNaN(offsetRow[x]))
			{
				gPixelsData[offset] = 0;
			}
			else
			{
				var xDist = x - maxDist;
				var dist = Math.sqrt(yDistSquared + xDist*xDist);
				if (dist > maxDist - 1)
				{// Anti-aliased border
					var fade = 1 - (dist - (maxDist - 1));
					gPixelsData[offset] = fade * 255;
				}
				else
				{// Fully opaque
					gPixelsData[offset] = 255;
				}
			}
			offset += 4;
		}
	}
};

/**
 * Populates internal variables with information about draw offsets for rendering the 3D globe.
 * (Populates: offsets, offsetRowsStarts, and offsetRowsLengths)
 */
Globe.prototype.calcOffsets = function()
{
	"use strict";
	// The 3D globe is drawn on a pure 2D canvas without any 3D libraries by precalculating pixel offsets.
	// Since the flat source image is a grid of pixels, and the rendered globe image is a grid of pixels, then we
	// can draw from one to the other by translating pixels.
	//     That’s what this does. For each horizontal strip of render pixel locations, source pixels locations
	// are calculated. Drawing the globe at a different rotation just means an additional horizonal offset in the.
	// source pixels. Then I can draw the globe using pixel data bytes, copying from one array of bytes to another.
	//     Alpha values (every fourth byte) are only written once at initialization.
	//     TODO: Consider pre-calculating only a quadrant instead of the whole globe? 
	var imageWidth = this.lambertImageWidth;
	var globeSize = this.size;
	var yx = [];
	var radius = globeSize / 2;
	var radiusSquared = radius * radius;
	var rowStarts = [];
	var rowLengths = [];
	for (var y = 0; y < globeSize; ++y)
	{
		var yDist = y - radius;
		var xDist = Math.sqrt(radiusSquared - yDist * yDist);
		var xIndent = radius - xDist;
		var xMult = (radius - xIndent) / radius;

		var hasDrawn = false;
		var row = [];
		var preDrawCount = 0;
		var drawCount = 0;
		var imageWidthHalf = imageWidth/2;
		for (var x = 0; x < globeSize; ++x)
		{
			var xPos1toNeg1 = 1 - (x / globeSize) * 2;
			xPos1toNeg1 /= xMult;
			var xRadiansZeroToPi = Math.acos(xPos1toNeg1);
			var imageXoffset = (xRadiansZeroToPi / Math.PI) * imageWidthHalf;
			row[x] = imageXoffset;
			if (isNaN(imageXoffset))
			{
				if (!hasDrawn)
					++preDrawCount;
			}
			else
			{
				hasDrawn = true;
				++drawCount;
			}
		}
		yx[y] = row;
		rowStarts[y] = preDrawCount;
		rowLengths[y] = drawCount;
	}
	this.offsets = yx;
	this.offsetRowsStarts = rowStarts;
	this.offsetRowsLengths = rowLengths;
};

/**
 * Extracts the ImageData from the given image (or on failure, creates ImageData (pixel bytes) from crude vector data)
 *
 * @param {Image} [image] - The image from which to extract ImageData
 * @param {number} [fallbackWidth=256] - The horizontal resolution if we fall back to a generated image
 * @param {number} [fallbackHeight=128] - The vertical resolution if we fall back to a generated image
 * @return {{image:object, data:ImageData}}
 */
Globe.getPixels = function(image, fallbackWidth, fallbackHeight)
{
	"use strict";
	var width;
	var height;
	if (image)
	{
		width = image.naturalWidth;
		height = image.naturalHeight;
		try
		{
			var canvas1 = document.createElement("canvas");
			canvas1.width = width;
			canvas1.height = height;
			var context1 = canvas1.getContext("2d");
			context1.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
			return {image: image, data: context1.getImageData(0, 0, image.naturalWidth, image.naturalHeight)};
		}
		catch (err)
		{
			if (console) {
				if (console.error)
					console.error(err);
				if (console.warn)
					console.warn("Could not load image, falling back to vector art");
			}
		}
	}
	else
	{
		width = fallbackWidth || 256;
		height = fallbackHeight || 128;
	}
	var canvas2 = document.createElement("canvas");
	canvas2.width = width;
	canvas2.height = height;
	var context2 = canvas2.getContext("2d");
	Globe.drawCrudeWorld(context2, width, height);
	return {image: canvas2, data: context2.getImageData(0, 0, width, height)};
};

/**
 * Draws a clip-art style map on the given context. Use as a fallback when an image is not available.
 *
 * @param {CanvasRenderingContext2D} context - The 2D canvas context on which to draw
 * @param {number} scaleX - The draw width in pixels
 * @param {number} scaleY - The draw height in pixels
 */
Globe.drawCrudeWorld = function(context, scaleX, scaleY)
{
	"use strict";
	// Format: polygons are separated by pipe characters. Each polygon has a CSS color (without the #) followed by a comma,
	// followed by pairs of coordinates. The first pair of coordinates is a full byte for x and a byte for y showing the starting position
	// in 256×256 space (to be scaled to the actual drawing area). Following coordinates are a nybble per x and a nybble per y
	// showing relative offsets of -8 to 7 within the 256×256 space. For example, the polygon "282,d87292777a" is:
	// color #282 (same as #228822),
	// and the coordinates on a 256×256 grid are:
	// "d872" = 216, 114;  "92" = 216+1, 114-6 = 217, 108;  "77" = 217-1, 108-1 = 216, 107;  "7a" = 216-1, 107+2 = 215, 108.

	var textData = "282,0a09b949c95a7afb3ce5a5a9c7eacfbcab7f9fafab9dafaf996070afbf9f9cdfa7adba9fbd95ac8f6f7f8faf9f9ecf8f8f7f8f7f7f8f7fafca72a27696939894b683a7b09194c4909284a090735457756782636468407646675f776a639075588490697c6a518192b5aa95b99a9f967093b28595b584a69ac586598468b7c67dc975778443636a66367c9b6a9b6984474567a5c49bc756b6b86bfbc303085a58186528197a090718|282,781bb78578|282,7c1dc7965387667aad|282,700cb9a638|282,444eb7bd795578|282,4c57b87568|282,9fb598929091737d6b8f7d|282,fac9ac988c7a|282,f7dca4934d8b|282,d1c6807081a5b592b29a9584baa78fad9292af8fadbf9f7f7f4f45726a72584c685a|282,e6d39c94|282,e329b765|282,dc3d7595b5b4939b7c8b5a6a|282,b96c8d7884|282,8dc7736080608090708160808367634c577a4160709270a0b092a4b8d4b89b8bbbbc94a7dbb79077586873b5b7c9965486688b556e9a6a77799b6b6075558abe7b7552776a677b7b7c4b658680d99454b6c3a784989cb8c785a8867686a55a6a7c6c636965b5f3f7faa94ac7f5f8d876c79d84d7e7f7faf8f9d8c6fbf8e9c8b88b7b3a297c4f81d269676a39483ccba87f737d5f695e9f6a837676588ba96caf7f6f3e7e7694776fae9f5f507b8fae9f8fae7cec8a376262606097be70738070787883605a5f6d8f7e7a60708065505856767954856abf8ba7969caa6f4f3f777060706179af9f9fafafc68d7f6f6f6f7f8f9f8f4f9f7c6c8d5f6a78|282,ce866194c095ac6c9c7d7f|282,e494a4bd638563437a5479bf|282,d87292777a|282,d5579c7d73|282,d6497e74|282,d48b80a68f75|282,d66aa46a|ccc,6010d2f6b7b3260908083bf8dbaf|ccc,3e04f7e608|ccc,a706c658|ccc,00fcf8f8f7f7f8f8f8f877b7f9f8b7b6e4b76c8dfaf8f8f5f6f8f8f8f8f8f6c6fac9a9f5f8f7f8e9c7f9f9f9caf81bf8e98a0908080807090808080808080808080808080808080808080808080808080818|038,a2318272a6997aad8f69|038,9684988379|038,452a989778|038,3f22b59a79|038,42288b778496b799897c86788678";

	var polys = textData.split("|");
	var polysCount = polys.length;
	context.fillStyle = "#038";
	context.fillRect(0, 0, scaleX, scaleY);
	scaleX /= 255.0;
	scaleY /= 255.0;
	for (var index = 0; index < polysCount && index < 999; ++index)
	{
		var colorAndPoints = polys[index].split(',');
		context.fillStyle = "#" + colorAndPoints[0];
		var points = colorAndPoints[1];
		var pointCount = (points.length-2) / 2;
		if (pointCount > 2)
		{
			context.beginPath();

			var x = parseInt(points.substr(0, 2), 16) * scaleX;
			var y = parseInt(points.substr(2, 2), 16) * scaleY;
			context.moveTo(x, y);
			for (var pindex =1; pindex < pointCount; ++pindex)
			{
				x += (parseInt(points.substr((pindex + 1) * 2, 1), 16)- 8) * scaleX;
				y += (parseInt(points.substr((pindex + 1) * 2 + 1, 1), 16) - 8) * scaleY;
				context.lineTo(x, y);
			}
			context.closePath();
			context.fill();
		}
	}
};

/**
 * A true mathematical modulus
 */
Globe.mod = function(val, n)
{
	"use strict";
	return ((val % n) + n) % n;
};

/**
 * Fills a circle on the canvas
 * 
 * @param {CanvasRenderingContext2D} context - The 2D graphics context of the canvas
 * @param {number} x - The x coordinate of the circle center
 * @param {number} y - The y coordinate of the circle center
 * @param {number} radius - The radius of the circle
 * @param {string} [color] - The CSS color to use
 */
Globe.fillCircle = function(context, x, y, radius, color)
{
	"use strict";
	var oldColor;
	if (color)
	{
		oldColor = context.fillStyle;
		context.fillStyle = color;
	}
	context.beginPath();
	context.arc(x, y, radius, 0, Math.PI*2, true);
	context.closePath();
	context.fill();
	if (color)
		context.fillStyle = oldColor;
};

/**
 * Draws the globe. Called automatically when the globe spins or locations are added or removed.
 * 
 * @param {number} [nowUtcMs] - The result of (new Date()).getTime()
 */
Globe.prototype.draw = function(nowUtcMs)
{
	"use strict";
	// The final globe has multiple layers:
	// • The bottommost canvas is for locations partially behind the globe
	// • The globe itself is a canvas rendered with byte operations on ImageData objects
	// • The shading on the globe is drawn on a canvas over the globe
	// • The topmost canvas of for locations in front of the globe
	
	// If awaiting an inage load, try again in a moment
	if (this.lambertImage && !this.lambertImage.complete) {
		var self = this;
		setTimeout(function() {self.draw();}, 100);
		return;
	};

	// Update spin position
	nowUtcMs = nowUtcMs ||  (new Date()).getTime();
	if (this.spinDegreesPerSecond)
		this._updateSpin(nowUtcMs);

	// Initialize offsets if needed
	if (this.offsets === null)
		this.initialize();

	// Draw the 3D globe
	this.draw3d();

	// Draw locations on the overlay and underlay layers
	this.drawLocations(nowUtcMs);

	if ((this.expireLocCount || this.spinDegreesPerSecond) && !this.animFrameRequest) {
		var self = this;
		this.animFrameRequest = requestAnimationFrame(function() {self.animFrameRequest=0; self.draw();});
	}
};

/**
 * Draws the 3D part of the globe (without shading)
 */
Globe.prototype.draw3d = function()
{
	// What’s going on here? We’re drawing a 3D globe by copying bytes at pre-calculated offsets
	// from one ImageData to another. See the comments in the calcOffsets() functions for more details.
	var thisSize = this.size;
	var gPixelsData = this.globePixels.data;

	var lambImageWidth = this.lambertImageWidth;
	var lambHeightAdjust = this.lambertImageHeight / thisSize; // Adjust if globe not exactly image size
	var xStart = lambImageWidth / 2 + ((this.degreesRotation + 270) / 360) * lambImageWidth;
	xStart = Globe.mod(xStart, lambImageWidth);
	var globeByteOffset = 0;

	var lambImagePixData = this.lambertImagePixels.data;
	var rowStarts = this.offsetRowsStarts;
	var rowLengths = this.offsetRowsLengths;
	var offs = this.offsets;

	for (var y = 0; y < thisSize; ++y)
	{
		var thisStart = rowStarts[y];
		var thisAfterEnd = thisStart + rowLengths[y];
		globeByteOffset = (y * thisSize + thisStart) * 4;
		var offsetRow =offs[y];
		var yByteOffset = ((y * lambHeightAdjust) >> 0) * lambImageWidth;
		for (var x = thisStart; x < thisAfterEnd; ++x)
		{
			var offset = ((xStart + offsetRow[x]) % lambImageWidth) >> 0;
			var sourceByteIndex = (yByteOffset + offset) * 4;
			gPixelsData[globeByteOffset] = lambImagePixData[sourceByteIndex];
			gPixelsData[globeByteOffset+1] = lambImagePixData[sourceByteIndex+1];
			gPixelsData[globeByteOffset+2] = lambImagePixData[sourceByteIndex+2];
			globeByteOffset += 4;
		}//…for x
	}//…for y
	this.g.putImageData(this.globePixels, this.xOffset, this.yOffset);
};

/**
 * Draws the LatLong location objects
 */
Globe.prototype.drawLocations = function(nowUtcMs)
{
	if (this.gOver && this.overDirty)
	{
		this.gOver.clearRect(0, 0, this.canvasOver.width, this.canvasOver.height);
		this.overDirty = false;
	}

	if (this.gUnder && this.underDirty)
	{
		this.gUnder.clearRect(0, 0, this.canvasUnder.width, this.canvasUnder.height);
		this.underDirty = false;
	}
	var grimReaperCount = 0;

	for (var index = 0; index < this.locations.length; ++index)
	{
		var geoc = this.locations[index];
		var where = this.getXYCoordinates(geoc);

		var textSize;
		var textX;
		var textY;
		var color = geoc.color || this.dotColor;
		var alpha = 1;
		if (geoc.expiration) {
			var timeLeft = geoc.expiration - nowUtcMs;
			if (timeLeft < 1000) {
				if (timeLeft <= 0) {
					geoc.isDead = true;
					grimReaperCount++;
					continue;
				}
				alpha = timeLeft / 1000;
			}
		}
		if (where.foreground)
		{
			var foreG = this.gOver || this.g;
			foreG.globalAlpha = alpha;

			Globe.fillCircle(foreG, where.x, where.y, this.dotRadius, color);
			if (geoc.description)
			{
				textSize = foreG.measureText(geoc.description);
				if (!textSize.height)
					textSize.height = 10;
				textX = where.x + ((where.xRel/2 - 0.5) * textSize.width);
				textY = where.y < this.size / 2 ? where.y - textSize.height : where.y + textSize.height;
				textY += this.textShiftDown * textSize.height;
				foreG.fillStyle = color;
				foreG.fillText(geoc.description, textX, textY);
			}
			this.overDirty = true;
		}
		if (this.gUnder)
		{
			if (!where.foreground)
			{
				this.gUnder.globalAlpha = alpha;
				Globe.fillCircle(this.gUnder, where.x, where.y, this.dotRadius, color);
				if (geoc.description)
				{
					textSize = this.gUnder.measureText(geoc.description);
					if (!textSize.height)
						textSize.height = 10;
					textX = where.x + ((where.xRel/2 - 0.5) * textSize.width);
					textY = where.y < this.size / 2 ? where.y - textSize.height : where.y + textSize.height;
					textY += this.textShiftDown * textSize.height;
					this.gUnder.fillStyle = color;
					this.gUnder.fillText(geoc.description, textX, textY);
				}
				this.underDirty = true;
			}
		}
	}//...for

	// Remove any expired locations
	if (grimReaperCount)
	{
		var remaining = grimReaperCount;
		for (var i = this.locations.length-1; remaining && i >= 0; --i)
		{
			var loc = this.locations[i];
			if (loc.isDead) {
				--remaining;
				this.locations.splice(i, 1);
			}
		}
		this.expireLocCount -= grimReaperCount;
	}
};
