from nodes import PreviewImage

from .image_ops import calculate_generation_size, composite_panel, crop_panel


class MangaPanelSelector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "x": ("INT", {"default": 0, "min": 0, "max": 16384}),
                "y": ("INT", {"default": 0, "min": 0, "max": 16384}),
                "width": ("INT", {"default": 512, "min": 0, "max": 16384}),
                "height": ("INT", {"default": 512, "min": 0, "max": 16384}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "MASK", "INT", "INT", "INT", "INT", "FLOAT")
    RETURN_NAMES = ("page_image", "panel_image", "panel_mask", "x", "y", "width", "height", "aspect_ratio")
    FUNCTION = "select_panel"
    CATEGORY = "image/manga"
    DESCRIPTION = "Selects a rectangular manga panel. Drag the rectangle in the node preview, then queue again."

    def __init__(self):
        self.preview = PreviewImage()

    def select_panel(self, image, x, y, width, height):
        page, panel, mask, x, y, width, height = crop_panel(image, x, y, width, height)
        preview = self.preview.save_images(page)["ui"]["images"]
        return {
            "ui": {"images": preview},
            "result": (page, panel, mask, x, y, width, height, width / height),
        }


class MangaPanelResolution:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "panel_width": ("INT", {"default": 512, "min": 1, "max": 16384}),
                "panel_height": ("INT", {"default": 512, "min": 1, "max": 16384}),
                "target_megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.05}),
                "multiple": ([8, 16, 32, 64], {"default": 64}),
                "max_width": ("INT", {"default": 2048, "min": 64, "max": 16384, "step": 64}),
                "max_height": ("INT", {"default": 2048, "min": 64, "max": 16384, "step": 64}),
                "mode": (["closest_area", "fit_within_bounds"],),
            }
        }

    RETURN_TYPES = ("INT", "INT", "FLOAT", "FLOAT")
    RETURN_NAMES = ("generation_width", "generation_height", "aspect_ratio", "scale_factor")
    FUNCTION = "calculate"
    CATEGORY = "image/manga"
    DESCRIPTION = "Calculates a model-friendly generation resolution while preserving the selected panel ratio."

    def calculate(self, panel_width, panel_height, target_megapixels, multiple, max_width, max_height, mode):
        result = calculate_generation_size(panel_width, panel_height, target_megapixels, int(multiple), max_width, max_height, mode)
        width, height = result[:2]
        resolution = f"{width} × {height} / {width * height / 1_000_000:.2f} MP"
        return {"ui": {"generation_resolution": [resolution]}, "result": result}


class MangaPanelComposite:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "page_image": ("IMAGE",),
                "generated_image": ("IMAGE",),
                "panel_mask": ("MASK",),
                "x": ("INT", {"default": 0, "min": 0, "max": 16384}),
                "y": ("INT", {"default": 0, "min": 0, "max": 16384}),
                "width": ("INT", {"default": 512, "min": 1, "max": 16384}),
                "height": ("INT", {"default": 512, "min": 1, "max": 16384}),
                "resize_mode": (["fill", "fit"],),
                "feather": ("INT", {"default": 0, "min": 0, "max": 128}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("composited_page", "resized_panel")
    FUNCTION = "composite"
    CATEGORY = "image/manga"
    DESCRIPTION = "Resizes a generated image to the selected panel and composites it back into the manga page."

    def composite(self, page_image, generated_image, panel_mask, x, y, width, height, resize_mode, feather):
        return composite_panel(page_image, generated_image, panel_mask, x, y, width, height, resize_mode, feather)


NODE_CLASS_MAPPINGS = {
    "ComfyUIMangaPanelSelector": MangaPanelSelector,
    "ComfyUIMangaPanelResolution": MangaPanelResolution,
    "ComfyUIMangaPanelComposite": MangaPanelComposite,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyUIMangaPanelSelector": "Manga Panel Selector",
    "ComfyUIMangaPanelResolution": "Manga Panel Resolution",
    "ComfyUIMangaPanelComposite": "Manga Panel Composite",
}
