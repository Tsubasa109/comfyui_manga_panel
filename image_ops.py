import math

import torch
import torch.nn.functional as F


def clamp_panel(x, y, width, height, image_width, image_height):
    if image_width < 1 or image_height < 1:
        raise ValueError("The page image must have a positive width and height.")
    if width < 1 or height < 1:
        raise ValueError("Select a panel before queuing the workflow.")

    x = min(max(int(x), 0), image_width - 1)
    y = min(max(int(y), 0), image_height - 1)
    width = min(int(width), image_width - x)
    height = min(int(height), image_height - y)
    if width < 1 or height < 1:
        raise ValueError("The selected panel is outside the page image.")
    return x, y, width, height


def calculate_generation_size(panel_width, panel_height, target_megapixels, multiple, max_width, max_height, mode):
    if panel_width < 1 or panel_height < 1:
        raise ValueError("Panel width and height must be positive.")
    if multiple < 1:
        raise ValueError("Resolution multiple must be positive.")
    if target_megapixels <= 0 or max_width < multiple or max_height < multiple:
        raise ValueError("Target megapixels and maximum dimensions must be positive.")

    ratio = panel_width / panel_height
    target_pixels = target_megapixels * 1_000_000
    raw_width = math.sqrt(target_pixels * ratio)
    raw_height = raw_width / ratio

    if mode == "fit_within_bounds":
        bound_scale = min(1.0, max_width / raw_width, max_height / raw_height)
        raw_width *= bound_scale
        raw_height *= bound_scale

    width = max(multiple, round(raw_width / multiple) * multiple)
    height = max(multiple, round(raw_height / multiple) * multiple)

    if width > max_width or height > max_height:
        bound_scale = min(max_width / width, max_height / height)
        width = max(multiple, math.floor(width * bound_scale / multiple) * multiple)
        height = max(multiple, math.floor(height * bound_scale / multiple) * multiple)

    scale_factor = math.sqrt((width * height) / (panel_width * panel_height))
    return width, height, ratio, scale_factor


def crop_panel(page_image, x, y, width, height):
    if page_image.ndim != 4:
        raise ValueError("IMAGE input must use ComfyUI's [B, H, W, C] layout.")
    if page_image.shape[0] != 1:
        raise ValueError("Manga Panel Selector currently accepts one page image at a time.")

    image_height, image_width = page_image.shape[1:3]
    x, y, width, height = clamp_panel(x, y, width, height, image_width, image_height)
    panel = page_image[:, y:y + height, x:x + width, :].clone()
    mask = torch.zeros((1, image_height, image_width), dtype=page_image.dtype, device=page_image.device)
    mask[:, y:y + height, x:x + width] = 1.0
    return page_image, panel, mask, x, y, width, height


def _resize_image(image, target_width, target_height, mode):
    source_height, source_width = image.shape[1:3]
    if mode == "fill":
        scale = max(target_width / source_width, target_height / source_height)
    else:
        scale = min(target_width / source_width, target_height / source_height)

    resized_width = max(1, round(source_width * scale))
    resized_height = max(1, round(source_height * scale))
    nchw = image.permute(0, 3, 1, 2)
    resized = F.interpolate(nchw, size=(resized_height, resized_width), mode="bicubic", align_corners=False).clamp(0.0, 1.0)
    resized = resized.permute(0, 2, 3, 1)

    if mode == "fill":
        left = max(0, (resized_width - target_width) // 2)
        top = max(0, (resized_height - target_height) // 2)
        panel = resized[:, top:top + target_height, left:left + target_width, :]
        alpha = torch.ones((image.shape[0], target_height, target_width), dtype=image.dtype, device=image.device)
        return panel, alpha

    panel = torch.zeros((image.shape[0], target_height, target_width, image.shape[3]), dtype=image.dtype, device=image.device)
    alpha = torch.zeros((image.shape[0], target_height, target_width), dtype=image.dtype, device=image.device)
    left = (target_width - resized_width) // 2
    top = (target_height - resized_height) // 2
    panel[:, top:top + resized_height, left:left + resized_width, :] = resized
    alpha[:, top:top + resized_height, left:left + resized_width] = 1.0
    return panel, alpha


def composite_panel(page_image, generated_image, panel_mask, x, y, width, height, resize_mode, feather):
    if page_image.ndim != 4 or generated_image.ndim != 4:
        raise ValueError("Page and generated images must use ComfyUI's [B, H, W, C] layout.")
    if page_image.shape[0] != 1:
        raise ValueError("Manga Panel Composite currently accepts one page image at a time.")
    if page_image.shape[3] != generated_image.shape[3]:
        raise ValueError("Page and generated images must have the same channel count.")

    image_height, image_width = page_image.shape[1:3]
    x, y, width, height = clamp_panel(x, y, width, height, image_width, image_height)
    generated_image = generated_image.to(device=page_image.device, dtype=page_image.dtype)
    resized_panel, content_alpha = _resize_image(generated_image, width, height, resize_mode)

    batch_size = resized_panel.shape[0]
    output = page_image.expand(batch_size, -1, -1, -1).clone()
    if panel_mask.ndim == 2:
        panel_mask = panel_mask.unsqueeze(0)
    if panel_mask.ndim != 3:
        raise ValueError("MASK input must use ComfyUI's [B, H, W] layout.")
    if panel_mask.shape[1:3] != (image_height, image_width):
        raise ValueError("Panel mask dimensions must match the page image.")

    mask = panel_mask[:1].to(device=page_image.device, dtype=page_image.dtype)
    mask = mask[:, y:y + height, x:x + width].expand(batch_size, -1, -1)
    alpha = mask * content_alpha
    if feather > 0:
        radius = int(feather)
        kernel_size = radius * 2 + 1
        alpha = F.avg_pool2d(alpha.unsqueeze(1), kernel_size, stride=1, padding=radius).squeeze(1)

    destination = output[:, y:y + height, x:x + width, :]
    alpha = alpha.unsqueeze(-1)
    output[:, y:y + height, x:x + width, :] = resized_panel * alpha + destination * (1.0 - alpha)
    return output, resized_panel
