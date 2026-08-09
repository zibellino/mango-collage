package zibellino.mango.collage

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlin.math.floor

// Millimeters per inch, used to convert the 5mm grid spacing into pixels via
// the display's density (dots-per-inch), so the grid is physically accurate
// rather than tied to arbitrary density-independent pixels.
private const val MM_PER_INCH = 25.4f
private const val GRID_SPACING_MM = 5f

private const val MIN_SCALE = 0.2f
private const val MAX_SCALE = 40f

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        GridCanvas()
                        MenuButton(modifier = Modifier.align(Alignment.TopStart))
                    }
                }
            }
        }
    }
}

@Composable
private fun GridCanvas() {
    // Offset is in screen pixels (the pan translation applied before scaling);
    // scale is the current zoom factor.
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }

    val density = LocalDensity.current
    val gridSpacingPx = with(density) { (GRID_SPACING_MM / MM_PER_INCH) * density.density * 160f }
    // density.density is px-per-dp relative to 160dpi baseline, so
    // density.density * 160 recovers the actual screen dpi.

    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .pointerInput(Unit) {
                detectTransformGestures { centroid, pan, zoom, _ ->
                    val newScale = (scale * zoom).coerceIn(MIN_SCALE, MAX_SCALE)

                    // Keep the point under the centroid fixed on screen while
                    // zooming, then apply the pan on top.
                    offset = (offset - centroid) * (newScale / scale) + centroid + pan
                    scale = newScale
                }
            }
    ) {
        val spacing = gridSpacingPx * scale
        if (spacing <= 0f) return@Canvas

        val lineColor = Color(0xFFBBBBBB)
        val axisColor = Color(0xFF666666)
        val strokeWidth = 1f

        // Find the first visible grid line (in screen space) at/after 0,0
        // by working out how many grid cells the offset represents.
        val startX = offset.x % spacing - spacing
        val startY = offset.y % spacing - spacing

        var x = startX
        var index = floor((-offset.x) / spacing).toInt()
        while (x <= size.width) {
            drawLine(
                color = if (index == 0) axisColor else lineColor,
                start = Offset(x, 0f),
                end = Offset(x, size.height),
                strokeWidth = if (index == 0) strokeWidth * 2 else strokeWidth,
                cap = StrokeCap.Butt
            )
            x += spacing
            index++
        }

        var y = startY
        var jIndex = floor((-offset.y) / spacing).toInt()
        while (y <= size.height) {
            drawLine(
                color = if (jIndex == 0) axisColor else lineColor,
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = if (jIndex == 0) strokeWidth * 2 else strokeWidth,
                cap = StrokeCap.Butt
            )
            y += spacing
            jIndex++
        }
    }
}

@Composable
private fun MenuButton(modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier.padding(8.dp)) {
        IconButton(onClick = { expanded = true }) {
            HamburgerIcon()
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("Add") },
                onClick = {
                    expanded = false
                    // TODO: wire up the actual add action
                }
            )
        }
    }
}

// Drawn manually rather than pulling in the material-icons-core/-extended
// artifacts just for a single glyph.
@Composable
private fun HamburgerIcon() {
    Canvas(modifier = Modifier.size(24.dp)) {
        val barColor = Color(0xFF444444)
        val strokeWidth = size.minDimension * 0.09f
        val inset = size.width * 0.15f
        val ys = listOf(size.height * 0.25f, size.height * 0.5f, size.height * 0.75f)
        ys.forEach { y ->
            drawLine(
                color = barColor,
                start = Offset(inset, y),
                end = Offset(size.width - inset, y),
                strokeWidth = strokeWidth,
                cap = StrokeCap.Round
            )
        }
    }
}

