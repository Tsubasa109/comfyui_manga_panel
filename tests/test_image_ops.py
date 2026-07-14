import importlib.util
from pathlib import Path

import pytest
import torch


MODULE_PATH = Path(__file__).parents[1] / "image_ops.py"
SPEC = importlib.util.spec_from_file_location("manga_panel_image_ops", MODULE_PATH)
IMAGE_OPS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMAGE_OPS)


@pytest.mark.parametrize(
    ("panel_width", "panel_height", "orientation"),
    [(400, 800, "portrait"), (800, 400, "landscape"), (500, 500, "square")],
)
def test_generation_size_preserves_orientation_and_multiple(panel_width, panel_height, orientation):
    width, height, ratio, scale = IMAGE_OPS.calculate_generation_size(
        panel_width, panel_height, 1.0, 64, 2048, 2048, "closest_area"
    )

    assert width % 64 == 0
    assert height % 64 == 0
    assert width <= 2048
    assert height <= 2048
    assert ratio == panel_width / panel_height
    assert scale > 0
    assert (width < height) if orientation == "portrait" else (width > height) if orientation == "landscape" else width == height


def test_crop_clamps_selection_to_page_and_returns_standard_mask():
    page = torch.zeros((1, 100, 200, 3), dtype=torch.float32)
    page[:, 20:100, 150:200, :] = 0.75

    returned_page, panel, mask, x, y, width, height = IMAGE_OPS.crop_panel(page, 150, 20, 100, 100)

    assert returned_page is page
    assert (x, y, width, height) == (150, 20, 50, 80)
    assert panel.shape == (1, 80, 50, 3)
    assert mask.shape == (1, 100, 200)
    assert torch.all(panel == 0.75)
    assert mask.sum().item() == 50 * 80


def test_crop_rejects_empty_selection():
    page = torch.zeros((1, 100, 200, 3), dtype=torch.float32)
    with pytest.raises(ValueError, match="Select a panel"):
        IMAGE_OPS.crop_panel(page, 0, 0, 0, 50)


def test_fill_composite_replaces_only_selected_panel():
    page = torch.zeros((1, 100, 100, 3), dtype=torch.float32)
    generated = torch.ones((1, 40, 80, 3), dtype=torch.float32)
    mask = torch.zeros((1, 100, 100), dtype=torch.float32)
    mask[:, 20:60, 10:40] = 1.0

    result, resized = IMAGE_OPS.composite_panel(page, generated, mask, 10, 20, 30, 40, "fill", 0)

    assert result.shape == page.shape
    assert resized.shape == (1, 40, 30, 3)
    assert torch.all(result[:, 20:60, 10:40, :] == 1.0)
    assert result.sum().item() == 30 * 40 * 3


def test_fit_composite_keeps_page_outside_letterboxed_content():
    page = torch.full((1, 80, 80, 3), 0.25, dtype=torch.float32)
    generated = torch.ones((1, 20, 40, 3), dtype=torch.float32)
    mask = torch.ones((1, 80, 80), dtype=torch.float32)

    result, resized = IMAGE_OPS.composite_panel(page, generated, mask, 20, 20, 40, 40, "fit", 0)

    assert resized.shape == (1, 40, 40, 3)
    assert torch.all(result[:, 20:30, 20:60, :] == 0.25)
    assert torch.all(result[:, 30:50, 20:60, :] == 1.0)
    assert torch.all(result[:, 50:60, 20:60, :] == 0.25)
