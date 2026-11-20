"""High-resolution diagram renderer using PyMuPDF (fitz).

Renders .drawio diagrams into clean, presentation-quality PNG images with:
- Correct layer ordering (swimlanes -> nodes -> edges & labels on top)
- Crisp arrowheads on directed edges
- Sequence diagram support (handling sourcePoint / targetPoint coordinates)
- High-DPI rasterization (200 DPI)
"""

import os
import re
import math
import html
import xml.etree.ElementTree as ET
import fitz


def hex_to_rgb(hex_str, default=(0.2, 0.2, 0.2)):
    if not hex_str or hex_str == "none":
        return None
    hex_str = hex_str.lstrip("#")
    if len(hex_str) == 6:
        return tuple(int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    return default


def parse_style(style_str):
    res = {}
    if not style_str:
        return res
    for part in style_str.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            res[k.strip()] = v.strip()
        elif part.strip():
            res[part.strip()] = True
    return res


def draw_arrow(page, p_from, p_to, color, width=1.8, dashed=False, arrow_size=8):
    """Draw a directed line with an arrowhead at p_to."""
    # Line
    page.draw_line(p_from, p_to, color=color, width=width, dashes="[4 4]" if dashed else None)

    # Arrowhead
    dx = p_to.x - p_from.x
    dy = p_to.y - p_from.y
    dist = math.hypot(dx, dy)
    if dist < 5:
        return

    angle = math.atan2(dy, dx)
    p_tip = p_to
    p_left = fitz.Point(
        p_to.x - arrow_size * math.cos(angle - math.pi / 6),
        p_to.y - arrow_size * math.sin(angle - math.pi / 6)
    )
    p_right = fitz.Point(
        p_to.x - arrow_size * math.cos(angle + math.pi / 6),
        p_to.y - arrow_size * math.sin(angle + math.pi / 6)
    )

    shape = page.new_shape()
    shape.draw_polyline([p_tip, p_left, p_right, p_tip])
    shape.finish(color=color, fill=color, width=1.0)
    shape.commit()


def render_diagram_to_png(drawio_file, output_png_file):
    tree = ET.parse(drawio_file)
    root = tree.getroot()
    diagram = root.find(".//diagram")
    if diagram is None:
        print(f"No diagram found in {drawio_file}")
        return

    cells = diagram.findall(".//mxCell")
    nodes = {}
    edges = []

    min_x, min_y = 1e9, 1e9
    max_x, max_y = -1e9, -1e9

    for cell in cells:
        cid = cell.attrib.get("id")
        val = cell.attrib.get("value", "")
        style = parse_style(cell.attrib.get("style", ""))
        is_edge = cell.attrib.get("edge") == "1"
        source = cell.attrib.get("source")
        target = cell.attrib.get("target")
        parent = cell.attrib.get("parent")

        geo = cell.find("mxGeometry")
        if is_edge:
            edges.append({
                "id": cid, "value": val, "style": style,
                "source": source, "target": target, "geo": geo, "parent": parent
            })
        elif geo is not None and ("x" in geo.attrib or "y" in geo.attrib or "width" in geo.attrib):
            x = float(geo.attrib.get("x", 0))
            y = float(geo.attrib.get("y", 0))
            w = float(geo.attrib.get("width", 100))
            h = float(geo.attrib.get("height", 40))

            nodes[cid] = {
                "id": cid, "value": val, "style": style,
                "x": x, "y": y, "w": w, "h": h, "parent": parent
            }

    # Resolve absolute coordinates
    for cid, node in list(nodes.items()):
        pid = node["parent"]
        if pid in nodes:
            node["abs_x"] = nodes[pid]["x"] + node["x"]
            node["abs_y"] = nodes[pid]["y"] + node["y"]
        else:
            node["abs_x"] = node["x"]
            node["abs_y"] = node["y"]

        min_x = min(min_x, node["abs_x"])
        min_y = min(min_y, node["abs_y"])
        max_x = max(max_x, node["abs_x"] + node["w"])
        max_y = max(max_y, node["abs_y"] + node["h"])

    # Expand bounds for edges with explicit geometry points
    for edge in edges:
        geo = edge["geo"]
        if geo is not None:
            for pt in geo.findall("mxPoint"):
                px = float(pt.attrib.get("x", 0))
                py = float(pt.attrib.get("y", 0))
                min_x = min(min_x, px)
                min_y = min(min_y, py)
                max_x = max(max_x, px)
                max_y = max(max_y, py)

    margin = 60
    content_w = max(700, max_x - min_x + 2 * margin)
    content_h = max(500, max_y - min_y + 2 * margin)
    offset_x = margin - min_x
    offset_y = margin - min_y

    doc = fitz.open()
    page = doc.new_page(width=content_w, height=content_h)

    # Clean crisp background
    page.draw_rect(fitz.Rect(0, 0, content_w, content_h), color=None, fill=(0.99, 0.99, 1.0))

    # =========================================================================
    # LAYER 1: Draw Container Frames & Swimlane Backgrounds
    # =========================================================================
    for cid, node in nodes.items():
        style = node["style"]
        is_container = style.get("swimlane") or style.get("shape") == "umlFrame" or style.get("group")
        if not is_container:
            continue

        nx = node["abs_x"] + offset_x
        ny = node["abs_y"] + offset_y
        nw = node["w"]
        nh = node["h"]
        rect = fitz.Rect(nx, ny, nx + nw, ny + nh)

        fill_col = hex_to_rgb(style.get("fillColor"), default=(0.95, 0.97, 1.0))
        stroke_col = hex_to_rgb(style.get("strokeColor"), default=(0.3, 0.4, 0.6))

        page.draw_rect(rect, color=stroke_col, fill=fill_col, width=1.2, radius=0.08)

        # Container header bar
        if style.get("swimlane"):
            header_h = float(style.get("startSize", 26))
            header_rect = fitz.Rect(nx, ny, nx + nw, ny + header_h)
            page.draw_rect(header_rect, color=stroke_col, fill=stroke_col, width=0.5)

            # Header text
            val = node["value"]
            if val:
                clean_title = re.sub(r"<[^>]+>", "", html.unescape(val)).split("\n")[0].strip()
                page.insert_text(fitz.Point(nx + 10, ny + 18), clean_title, fontsize=10.5, color=(1.0, 1.0, 1.0))
        elif style.get("shape") == "umlFrame":
            val = node["value"]
            if val:
                clean_title = re.sub(r"<[^>]+>", "", html.unescape(val)).strip()
                page.insert_text(fitz.Point(nx + 8, ny + 15), clean_title, fontsize=9.5, color=stroke_col)

    # =========================================================================
    # LAYER 2: Draw Standard Nodes (Rectangles, Rhombuses, Ellipses, Text)
    # =========================================================================
    for cid, node in nodes.items():
        style = node["style"]
        is_container = style.get("swimlane") or style.get("shape") == "umlFrame" or style.get("group")
        if is_container:
            continue

        nx = node["abs_x"] + offset_x
        ny = node["abs_y"] + offset_y
        nw = node["w"]
        nh = node["h"]
        val = node["value"]

        fill_col = hex_to_rgb(style.get("fillColor"), default=(0.97, 0.98, 1.0))
        stroke_col = hex_to_rgb(style.get("strokeColor"), default=(0.3, 0.4, 0.6))
        font_col = hex_to_rgb(style.get("fontColor"), default=(0.1, 0.15, 0.25))

        if style.get("rhombus"):
            p1 = fitz.Point(nx + nw / 2.0, ny)
            p2 = fitz.Point(nx + nw, ny + nh / 2.0)
            p3 = fitz.Point(nx + nw / 2.0, ny + nh)
            p4 = fitz.Point(nx, ny + nh / 2.0)
            shape = page.new_shape()
            shape.draw_polyline([p1, p2, p3, p4, p1])
            shape.finish(color=stroke_col, fill=fill_col, width=1.5)
            shape.commit()
        elif style.get("ellipse"):
            rect = fitz.Rect(nx, ny, nx + nw, ny + nh)
            page.draw_oval(rect, color=stroke_col, fill=fill_col, width=1.5)
        elif style.get("shape") == "umlLifeline":
            # Lifeline header box + dashed center line
            header_h = float(style.get("size", 40))
            head_rect = fitz.Rect(nx, ny, nx + nw, ny + header_h)
            page.draw_rect(head_rect, color=stroke_col, fill=fill_col, width=1.5, radius=0.1)

            # Center line
            cx = nx + nw / 2.0
            page.draw_line(fitz.Point(cx, ny + header_h), fitz.Point(cx, ny + nh), color=stroke_col, width=1.2, dashes="[5 5]")
        elif style.get("text") or style.get("strokeColor") == "none":
            # Plain text or title box
            pass
        else:
            rect = fitz.Rect(nx, ny, nx + nw, ny + nh)
            radius_val = 0.12 if style.get("rounded") == "1" else None
            page.draw_rect(rect, color=stroke_col, fill=fill_col, width=1.5, radius=radius_val)

        # Node Text Formatting
        if val:
            clean_text = val.replace("&#xa;", "\n").replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&")
            clean_text = re.sub(r"<br\s*/?>", "\n", clean_text)
            clean_text = re.sub(r"<[^>]+>", "", clean_text)
            lines = [l.strip() for l in clean_text.split("\n") if l.strip()]

            is_title = float(style.get("fontSize", 11)) >= 16
            cur_y = ny + (nh / 2.0 - len(lines) * 6 + 10) if not is_title else ny + 20

            for line in lines:
                if is_title:
                    page.insert_text(fitz.Point(nx + 10, cur_y), line, fontsize=15, color=(0.1, 0.15, 0.3))
                    cur_y += 22
                else:
                    fsize = float(style.get("fontSize", 9.5))
                    tcol = font_col if font_col else (0.1, 0.15, 0.25)
                    page.insert_text(fitz.Point(nx + 8, cur_y), line, fontsize=fsize, color=tcol)
                    cur_y += fsize + 3.5

    # =========================================================================
    # LAYER 3: Draw Edges & Arrows ON TOP of All Boxes
    # =========================================================================
    for edge in edges:
        val = edge["value"]
        style = edge["style"]
        geo = edge["geo"]

        s_node = nodes.get(edge["source"])
        t_node = nodes.get(edge["target"])

        sx, sy, tx, ty = None, None, None, None

        if s_node and t_node:
            sx = s_node["abs_x"] + s_node["w"] / 2.0 + offset_x
            sy = s_node["abs_y"] + s_node["h"] / 2.0 + offset_y
            tx = t_node["abs_x"] + t_node["w"] / 2.0 + offset_x
            ty = t_node["abs_y"] + t_node["h"] / 2.0 + offset_y

            # Clip to border
            if abs(tx - sx) > abs(ty - sy):
                # Horizontal dominant
                if tx > sx:
                    sx = s_node["abs_x"] + s_node["w"] + offset_x
                    tx = t_node["abs_x"] + offset_x
                else:
                    sx = s_node["abs_x"] + offset_x
                    tx = t_node["abs_x"] + t_node["w"] + offset_x
            else:
                # Vertical dominant
                if ty > sy:
                    sy = s_node["abs_y"] + s_node["h"] + offset_y
                    ty = t_node["abs_y"] + offset_y
                else:
                    sy = s_node["abs_y"] + offset_y
                    ty = t_node["abs_y"] + t_node["h"] + offset_y

        elif geo is not None:
            # Check sourcePoint & targetPoint (used in Sequence diagrams)
            p1 = geo.find('mxPoint[@as="sourcePoint"]')
            p2 = geo.find('mxPoint[@as="targetPoint"]')
            if p1 is not None and p2 is not None:
                sx = float(p1.attrib.get("x", 0)) + offset_x
                sy = float(p1.attrib.get("y", 0)) + offset_y
                tx = float(p2.attrib.get("x", 0)) + offset_x
                ty = float(p2.attrib.get("y", 0)) + offset_y

        if sx is not None and tx is not None:
            edge_col = hex_to_rgb(style.get("strokeColor"), default=(0.2, 0.4, 0.7))
            dashed = style.get("dashed") == "1"
            has_arrow = style.get("endArrow") not in ("none", False)

            if has_arrow:
                draw_arrow(page, fitz.Point(sx, sy), fitz.Point(tx, ty), color=edge_col, width=1.6, dashed=dashed)
            else:
                page.draw_line(fitz.Point(sx, sy), fitz.Point(tx, ty), color=edge_col, width=1.6, dashes="[4 4]" if dashed else None)

            # Edge label
            if val:
                clean_lbl = re.sub(r"<[^>]+>", " ", html.unescape(val)).strip()
                mx = (sx + tx) / 2.0
                my = (sy + ty) / 2.0 - 5
                page.insert_text(fitz.Point(mx - len(clean_lbl) * 2.8, my), clean_lbl, fontsize=9, color=(0.1, 0.15, 0.25))

    # High-DPI export
    pix = page.get_pixmap(dpi=200)
    pix.save(output_png_file)
    print(f"Generated: {output_png_file} ({pix.width}x{pix.height})")


def main():
    src_dir = r"docs/diagrams"
    out_dir = r"docs/diagrams/images"
    os.makedirs(out_dir, exist_ok=True)

    diagram_files = [f for f in os.listdir(src_dir) if f.endswith(".drawio")]

    for df in diagram_files:
        src = os.path.join(src_dir, df)
        dst = os.path.join(out_dir, os.path.splitext(df)[0] + ".png")
        try:
            render_diagram_to_png(src, dst)
        except Exception as e:
            print(f"Error rendering {df}: {e}")


if __name__ == "__main__":
    main()
