(function($) {
	var canvas;
	var context;
	// �ԽǶ�
	var fov;
	var tilt;
	var pan;
	//
	var vwidth;
	var vheight;
	var pwidth;
	var pheight;
	var srcMat;
	var imgMat;
	var r;
	var cwidth;
	var cheight;
	// Worker
	var worker;

	var steps = 7;
	var hotspots = [];

	function Mat(_row, _col, _data, _buffer) {
		this.row = _row || 0;
		this.col = _col || 0;
		this.channel = 4;
		this.buffer = _buffer || new ArrayBuffer(_row * _col * 4);
		this.data = new Uint8ClampedArray(this.buffer);
		_data && this.data.set(_data);
		this.bytes = 1;
		this.type = "CV_RGBA";
	}
	function imread(_image) {
		var width = _image.width;
		var height = _image.height;
		canvas.width = width;
		canvas.height = height;
		context.drawImage(_image, 0, 0);
		var imageData = context.getImageData(0, 0, width, height);
		var tmpMat = new Mat(height, width, imageData.data);
		imageData = null;
		context.clearRect(0, 0, width, height);
		return tmpMat;
	}
	function setMatrix(_tilt, _pan) {
		var mt1 = new Float32Array(3 * 3);
		var mt2 = new Float32Array(3 * 3);
		mt1[0] = 1;
		mt1[1] = 0;
		mt1[2] = 0;
		mt1[3] = 0;
		mt1[4] = Math.cos(_tilt * Math.PI / 180);
		mt1[5] = Math.sin(_tilt * Math.PI / 180);
		mt1[6] = 0;
		mt1[7] = -mt1[5];
		mt1[8] = mt1[4];
		mt2[0] = Math.cos(_pan * Math.PI / 180);
		mt2[1] = 0;
		mt2[2] = -Math.sin(_pan * Math.PI / 180);
		mt2[3] = 0;
		mt2[4] = 1;
		mt2[5] = 0;
		mt2[6] = -mt2[2];
		mt2[7] = 0;
		mt2[8] = mt2[0];
		var mt = new Float32Array(3 * 3);
		var i = 0;
		var j = 0;
		for (i = 0; i != 3; i++) {
			for (j = 0; j != 3; j++) {
				mt[i * 3 + j] = mt1[i * 3 + 0] * mt2[0 * 3 + j]
						+ mt1[i * 3 + 1] * mt2[1 * 3 + j] + mt1[i * 3 + 2]
						* mt2[2 * 3 + j];

			}
		}
		return mt

	}

	function RGBA2ImageData(_imgMat) {
		var width = _imgMat.col, height = _imgMat.row, imageData = context
				.createImageData(width, height);
		imageData.data.set(_imgMat.data);
		return imageData;
	}
	function HS(_x, _y, _width, _height, _panoId, _dstId, _dst) {
		this.x = _x;
		this.y = _y;
		this.width = _width;
		this.height = _height;
		this.panoId = _panoId;
		this.dstId = _dstId;
		this.dst = _dst;
	}
	function draw() {
		// transform view position to pan tilt angle;
		vwidth = parseInt(2 * r * Math.tan(fov * Math.PI / 360));
		vheight = parseInt(vwidth * 2 / 3);
		var i = 0, j = 0, k = 0;

		var view;

		view = new Float32Array(vheight * vwidth * 3);
		for (i = 0; i != vheight; ++i) {

			for (j = 0; j != vwidth; ++j) {

				view[(i * vwidth + j) * 3] = j - (vwidth / 2);

				view[(i * vwidth + j) * 3 + 1] = -(i + k * vheight)
						+ (vheight / 2) - 1;
				view[(i * vwidth + j) * 3 + 2] = -r;

			}
		}
		worker.postMessage({
			tilt : tilt,
			pan : pan,
			// fov : fov,
			view : view,
			vheight : vheight,
			vwidth : vwidth,
			radius : r,
			pwidth : pwidth,
			pheight : pheight
		}, [ view.buffer ]);

	}

	function createWorker() {
		var imgData = imgMat.data;
		var srcData = srcMat.data;
		worker = new Worker("compute_task.js");
		worker.onmessage = function(event) {

			var u = 0, v = 0;
			var pano_pos = event.data.pano;
			for ( var j = 0; j != vheight; ++j) {
				for ( var k = 0; k != vwidth; ++k) {
					u = pano_pos[(j * vwidth + k) * 2];
					v = pano_pos[(j * vwidth + k) * 2 + 1];
					for ( var l = 0; l != 4; ++l) {
						imgData[((j) * vwidth + k) * 4 + l] = srcData[(v
								* pwidth + u)
								* 4 + l];
					}
				}
			}

			var zoomMat = new Mat(cheight, cwidth);
			var zoomData = zoomMat.data;
			var Sx = vwidth / cwidth;
			var Sy = vheight / cheight;
			for (j = 0; j != cheight; ++j) {
				for (k = 0; k != cwidth; ++k) {
					u = parseInt(k * Sx);
					v = parseInt(j * Sy);
					for (l = 0; l != 4; ++l) {
						zoomData[(j * cwidth + k) * 4 + l] = imgData[(v
								* vwidth + u)
								* 4 + l];
					}
				}
			}
			var img = RGBA2ImageData(zoomMat);
			// draw on the canvas
			context.clearRect(0, 0, cwidth, cheight);
			canvas.width = cwidth;
			canvas.height = cheight;

			context.putImageData(img, 0, 0);

		};
	}

	function checkHS(_x, _y) {
		var mt = setMatrix(tilt, pan);

		var Sx = vwidth / cwidth;
		var Sy = vheight / cheight;
		var ti = 0, tj = 0, tk = 0;
		var x = 0, y = 0, z = 0;
		ti = _x * Sx;
		tj = _y * Sy;
		tk = -r;

		x = ti * mt[0 * 3 + 0] + tj * mt[1 * 3 + 0] + tk * mt[2 * 3 + 0];
		y = ti * mt[0 * 3 + 1] + tj * mt[1 * 3 + 1] + tk * mt[2 * 3 + 1];
		z = ti * mt[0 * 3 + 2] + tj * mt[1 * 3 + 2] + tk * mt[2 * 3 + 2];

		if (z >= 0) {
			u = r * Math.acos(x / Math.sqrt(z * z + x * x));
			v = r * (Math.PI / 2 - Math.atan(y / Math.sqrt(x * x + z * z)));

		} else if (z < 0) {
			u = r * (Math.PI * 2 - Math.acos(x / Math.sqrt(z * z + x * x)));
			v = r * (Math.PI / 2 - Math.atan(y / Math.sqrt(x * x + z * z)));

		}

		if (u >= pwidth) {
			u -= pwidth;
		}
		if (u < 0) {
			u += pwidth;
		}

		u = parseInt(u);
		v = parseInt(v);
		console.log("u:" + u + "v:" + v + "\n");
		for ( var i in hotspots) {
			var hs = hotspots[i];
			if (hs.panoId == panoImg.id) {
				if (u > hs.x && u < (hs.x + hs.width) && v > hs.y
						&& v < (hs.y + hs.height)) {
					panoImg.src = hs.dst;
					panoImg.id = hs.disId;
				}
			}
		}
	}
	function hemitte() {

		for ( var i in MaxBeautifulPoints) {
			var mbp = MaxBeautifulPoints[i];
			if (panoImg.id == mbp.id)
				break;
		}
		for ( var t = 0; t != steps; ++t) {
			var s = t / steps;
			var h1 = 2 * s * s * s - 3 * s * s + 1;
			var h2 = -2 * s * s * s + 3 * s * s;
			var h3 = s * s * s - 2 * s * s + s;
			var h4 = s * s * s - s * s;

		}

	}
	$.fn.panorama = function() {
		this
				.each(function() {
					vwidth = 600;
					vheight = 400;
					pwidth = 0;
					pheight = 0;
					fov = 90;
					pan = 90;
					tilt = 0;

					var pano_mouse_position_x = vwidth / 2;
					var pano_mouse_position_y = vheight / 2;
					var pano_mouse_delta_x = 0;
					var pano_mouse_delta_y = 0;
					var pano_mouse_down = false;

					var pano_element = this;
					cwidth = $(pano_element).width();
					cheight = $(pano_element).height();
					canvas = this;
					context = this.getContext("2d");

					hotspots.push(new HS(500, 200, 400, 400, "v2", "v1",
							"imgs\\v1.jpg"));

					panoImg = new Image();

					panoImg.onload = function() {
						// timend=(new Date()).getTime();

						// console.log(timend - timbeg);
						pwidth = panoImg.width;
						pheight = panoImg.height;
						srcMat = imread(panoImg);
						r = pwidth / (2 * Math.PI);

						vwidth = parseInt(2 * r * Math.tan(fov * Math.PI / 360));
						vheight = parseInt(vwidth * 2 / 3);
						imgMat = new Mat(vheight, vwidth);

						createWorker();

						draw();

						$(pano_element).bind('mousedown', function(event) {
							pano_mouse_down = true;
							pano_mouse_position_x = event.clientX;
							pano_mouse_position_y = event.clientY;
							$(pano_element).parent().css("cursor", "move");

						});
						$(pano_element).bind('mouseup', function() {
							pano_mouse_down = false;
							$(pano_element).parent().css("cursor", "default");

						});
						$(pano_element)
								.bind(
										'mousemove',
										function(event) {
											if (pano_mouse_down) {
												pano_mouse_delta_x = pano_mouse_position_x
														- event.clientX;
												pano_mouse_delta_y = pano_mouse_position_y
														- event.clientY;

												pan += pano_mouse_delta_x / 100;

												tilt += pano_mouse_delta_y / 100;
												if (tilt > 90)
													tilt = 90;
												if (tilt < -90)
													tilt = -90;

												draw();

											}
										});
						$(pano_element).bind(
								'mousewheel',
								function(event) {
									var e = window.event || event;
									var deta = Math.max(-1, Math.min(1,
											(e.wheelDelta || -e.detail)));
									if (deta > 0) {
										fov /= 1.1;
										if (fov < 45)
											fov = 45;

									} else if (deta < 0) {
										fov *= 1.1;
										if (fov > 90)
											fov = 90;

									}
									draw();
								});
						$(pano_element).dblclick(function(event) {
							console.log("double click");

							checkHS(event.offsetX, event.offsetY);
						});

					};
					// timbeg=(new Date()).getTime();
					panoImg.src = "imgs\\v2.jpg";
					panoImg.id = "v2";

				});

	};
	$('document').ready(function() {
		$('canvas#c').panorama();
	});
})(jQuery);
