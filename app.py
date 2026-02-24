import base64
from io import BytesIO
from flask import Flask, render_template, request, send_file, jsonify
from PIL import Image
from image_utils import flatten_alpha_to_white, to_1bit_threshold, write_pbm_ascii_p1, image_to_png_bytes

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.post("/api/open")
def api_open():
    """
    Accepts PNG or PBM, converts to 1-bit, returns base64-encoded PNG + dimensions.
    For PNG: applies default threshold 128 initially (client can re-threshold locally).
    """
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file"}), 400
    try:
        img = Image.open(f.stream)
        ext = (f.filename or "").lower().rsplit(".", 1)[-1]
        if ext == "png":
            img = flatten_alpha_to_white(img)
            img1 = to_1bit_threshold(img, 128)
        else:
            img1 = img.convert("1")
        png_bytes = image_to_png_bytes(img1)
        b64 = base64.b64encode(png_bytes).decode("ascii")
        return jsonify({
            "width": img1.width,
            "height": img1.height,
            "png": "data:image/png;base64," + b64
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.post("/api/save_p4")
def api_save_p4():
    # Expects a 1x PNG representing the current edited state (0/255 grayscale).
    file = request.files.get("img")
    if not file:
        return jsonify({"error": "No image"}), 400
    img = Image.open(file.stream).convert("1")
    buf = BytesIO()
    # Pillow writes PBM P4 for mode '1' when format="PBM"
    img.save(buf, format="PBM")
    buf.seek(0)
    return send_file(buf, mimetype="image/x-portable-bitmap",
                     as_attachment=True, download_name="sprite.pbm")

@app.post("/api/export_p1")
def api_export_p1():
    file = request.files.get("img")
    if not file:
        return jsonify({"error": "No image"}), 400
    img = Image.open(file.stream).convert("1")
    data = write_pbm_ascii_p1(img)
    return send_file(BytesIO(data), mimetype="image/x-portable-bitmap",
                     as_attachment=True, download_name="sprite_p1.pbm")

@app.post("/api/export_png")
def api_export_png():
    zoom = int(request.form.get("zoom", 1))
    file = request.files.get("img")
    if not file:
        return jsonify({"error": "No image"}), 400
    img = Image.open(file.stream).convert("1")
    if zoom > 1:
        img = img.resize((img.width * zoom, img.height * zoom), Image.NEAREST)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png",
                     as_attachment=True, download_name="sprite_preview.png")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
