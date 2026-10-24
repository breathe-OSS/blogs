import csv
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import matplotlib

matplotlib.use("Agg")
from matplotlib import dates as mdates
from matplotlib import font_manager
from matplotlib import pyplot as plt
from matplotlib.patches import FancyBboxPatch

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = sys.argv[1]
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

for name in ["Roboto-Regular.ttf", "Roboto-Medium.ttf", "Roboto-Bold.ttf"]:
    font_manager.fontManager.addfont(os.path.join(FONT_DIR, name))
plt.rcParams["font.family"] = "Roboto"

IST = timezone(timedelta(hours=5, minutes=30))
START = datetime(2026, 9, 10, tzinfo=IST)
OCT_START = datetime(2026, 10, 1, tzinfo=IST)

CITIES = [
    ("jammu_city", "Jammu", "#2e9bdc"),
    ("srinagar", "Srinagar", "#d85d92"),
]

BANDS = [
    (0.0, 9.0, "Good", "#00e400"),
    (9.0, 35.4, "Moderate", "#ffff00"),
    (35.4, 55.4, "Unhealthy for sensitive groups", "#ff7e00"),
    (55.4, 125.4, "Unhealthy", "#ff0000"),
    (125.4, 225.4, "Very unhealthy", "#8f3f97"),
    (225.4, 10000.0, "Hazardous", "#7e0023"),
]

AQI_TABLE = [
    (0.0, 9.0, 0, 50),
    (9.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 125.4, 151, 200),
    (125.5, 225.4, 201, 300),
    (225.5, 325.4, 301, 500),
]

THEMES = {
    "dark": {
        "bg": "#16181d",
        "text": "#e2e2e9",
        "muted": "#a9adb8",
        "grid": "#2a2d34",
        "band_alpha": 0.07,
        "ring": "#16181d",
    },
    "light": {
        "bg": "#f1f5f9",
        "text": "#0f172a",
        "muted": "#475569",
        "grid": "#d8dfe8",
        "band_alpha": 0.12,
        "ring": "#f1f5f9",
    },
}

SOURCE = "Source: Breathe ground sensors (AirGradient), api.breatheoss.app. Times in IST."


def us_aqi(pm25):
    value = round(pm25, 1)
    for c_lo, c_hi, i_lo, i_hi in AQI_TABLE:
        if value <= c_hi:
            return round((i_hi - i_lo) / (c_hi - c_lo) * (max(value, c_lo) - c_lo) + i_lo)
    return 500


def category(pm25):
    for lo, hi, label, _ in BANDS:
        if pm25 <= hi:
            return label
    return BANDS[-1][2]


def load(zone):
    rows = []
    with open(os.path.join(HERE, f"{zone}.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            when = datetime.fromtimestamp(int(row["ts"]), IST)
            if when < START or row["pm2_5"] in ("", None):
                continue
            rows.append((when, float(row["pm2_5"]), float(row["pm10"]) if row["pm10"] else None))
    rows.sort()
    return rows


def load_full(zone):
    rows = []
    with open(os.path.join(HERE, f"{zone}_full.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["pm2_5"] in ("", None):
                continue
            when = datetime.fromtimestamp(int(row["ts"]), IST)
            rows.append((when, float(row["pm2_5"])))
    rows.sort()
    return rows


def monthly_means(rows):
    months = {}
    for when, pm25 in rows:
        months.setdefault((when.year, when.month), []).append(pm25)
    return {key: sum(v) / len(v) for key, v in sorted(months.items())}


def daily_means(rows):
    days = {}
    for when, pm25, _ in rows:
        days.setdefault(when.date(), []).append(pm25)
    return {day: sum(v) / len(v) for day, v in days.items() if len(v) >= 18}


def rolling_24h(rows):
    out = []
    window = []
    for when, pm25, _ in rows:
        window.append((when, pm25))
        while window and when - window[0][0] >= timedelta(hours=24):
            window.pop(0)
        if len(window) >= 12:
            out.append((when, sum(v for _, v in window) / len(window)))
    return out


def hourly_profile(rows, start, end):
    buckets = {hour: [] for hour in range(24)}
    for when, pm25, _ in rows:
        if start <= when < end:
            buckets[when.hour].append(pm25)
    return [sum(v) / len(v) if v else None for hour, v in sorted(buckets.items())]


def stats(rows):
    first, last = rows[0][0], rows[-1][0]
    expected = int((last - first).total_seconds() // 3600) + 1
    daily = daily_means(rows)
    sep = [p for w, p, _ in rows if w < OCT_START]
    octo = [p for w, p, _ in rows if w >= OCT_START]
    peak = max(rows, key=lambda r: r[1])
    worst_day = max(daily.items(), key=lambda d: d[1])
    best_day = min(daily.items(), key=lambda d: d[1])
    categories = {}
    for value in daily.values():
        label = category(value)
        categories[label] = categories.get(label, 0) + 1
    pm10 = [p for _, _, p in rows if p is not None]
    return {
        "first_reading": first.isoformat(),
        "last_reading": last.isoformat(),
        "hours_with_data": len(rows),
        "hours_expected": expected,
        "coverage_pct": round(100 * len(rows) / expected, 1),
        "complete_days": len(daily),
        "mean_pm25_all": round(sum(p for _, p, _ in rows) / len(rows), 1),
        "mean_pm25_sep_10_30": round(sum(sep) / len(sep), 1),
        "mean_pm25_oct": round(sum(octo) / len(octo), 1),
        "oct_vs_sep_pct": round(100 * (sum(octo) / len(octo) / (sum(sep) / len(sep)) - 1), 1),
        "mean_pm10_all": round(sum(pm10) / len(pm10), 1),
        "peak_hour_pm25": round(peak[1], 1),
        "peak_hour_time": peak[0].strftime("%d %b %Y %H:%M"),
        "worst_day": worst_day[0].isoformat(),
        "worst_day_pm25": round(worst_day[1], 1),
        "worst_day_us_aqi": us_aqi(worst_day[1]),
        "best_day": best_day[0].isoformat(),
        "best_day_pm25": round(best_day[1], 1),
        "days_by_epa_category": categories,
        "days_above_epa_24h_standard_35": sum(1 for v in daily.values() if v > 35.0),
        "hours_above_55_4": sum(1 for _, p, _ in rows if p > 55.4),
        "hours_above_125_4": sum(1 for _, p, _ in rows if p > 125.4),
    }


def frame(fig, theme):
    fig.patch.set_alpha(0)
    width, height = fig.get_size_inches()
    card = FancyBboxPatch(
        (0, 0),
        1,
        1,
        boxstyle="round,pad=0,rounding_size=0.035",
        mutation_aspect=width / height,
        transform=fig.transFigure,
        facecolor=theme["bg"],
        edgecolor="none",
        zorder=-10,
    )
    fig.patches.append(card)


def label_box(theme):
    return {"boxstyle": "round,pad=0.25,rounding_size=0.4", "facecolor": theme["bg"], "edgecolor": "none", "alpha": 0.88}


def style_axes(ax, theme):
    ax.set_facecolor("none")
    for side in ["top", "right", "left"]:
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(theme["grid"])
    ax.tick_params(colors=theme["muted"], labelsize=10, length=0, pad=6)
    ax.grid(axis="y", color=theme["grid"], linewidth=0.8)
    ax.set_axisbelow(True)


SHORT_BANDS = {
    "Unhealthy for sensitive groups": "Unhealthy for\nsensitive groups",
}


def draw_bands(ax, theme, ymax, gutter=False):
    labels = []
    for lo, hi, label, color in BANDS:
        if lo >= ymax:
            break
        top = min(hi, ymax)
        ax.axhspan(lo, top, color=color, alpha=theme["band_alpha"], linewidth=0, zorder=0)
        if gutter:
            labels.append(((lo + top) / 2, SHORT_BANDS.get(label, label), color))
    if not labels:
        return

    fig = ax.figure
    points_to_px = fig.dpi / 72
    line_px = 8.5 * 1.25 * points_to_px
    placed = []
    floor = ax.transData.transform((0, 0))[1]
    ceiling = ax.transData.transform((0, ymax))[1]
    for middle, text, color in labels:
        height = line_px * (text.count("\n") + 1)
        y = ax.transData.transform((0, middle))[1]
        y = max(y, floor + height / 2)
        if placed:
            previous_y, previous_height = placed[-1][0], placed[-1][1]
            y = max(y, previous_y + previous_height / 2 + height / 2 + 4 * points_to_px)
        placed.append((y, height, text, color))
    overflow = placed[-1][0] + placed[-1][1] / 2 - ceiling
    if overflow > 0:
        placed = [(y - overflow, h, t, c) for y, h, t, c in placed]

    to_data = ax.transData.inverted()
    for y, _, text, color in placed:
        data_y = to_data.transform((0, y))[1]
        ax.annotate(
            "\u25A0",
            xy=(1.0, data_y),
            xycoords=("axes fraction", "data"),
            xytext=(8, 0),
            textcoords="offset points",
            color=color,
            fontsize=9,
            va="center",
            ha="left",
            annotation_clip=False,
        )
        ax.annotate(
            text,
            xy=(1.0, data_y),
            xycoords=("axes fraction", "data"),
            xytext=(22, 0),
            textcoords="offset points",
            color=theme["muted"],
            fontsize=8.5,
            linespacing=1.1,
            va="center",
            ha="left",
            annotation_clip=False,
        )


def titles(fig, theme, title, subtitle):
    fig.text(0.045, 0.94, title, color=theme["text"], fontsize=16, fontweight="bold", va="top")
    fig.text(0.045, 0.875, subtitle, color=theme["muted"], fontsize=10.5, va="top")
    fig.text(0.045, 0.035, SOURCE, color=theme["muted"], fontsize=8.5, va="bottom")


def legend(fig, theme, entries, x=0.045, y=0.80):
    renderer = fig.canvas.get_renderer()
    for label, color in entries:
        fig.patches.append(
            FancyBboxPatch(
                (x, y - 0.006),
                0.022,
                0.012,
                boxstyle="round,pad=0,rounding_size=0.006",
                transform=fig.transFigure,
                facecolor=color,
                edgecolor="none",
            )
        )
        text = fig.text(x + 0.03, y, label, color=theme["text"], fontsize=10.5, va="center", fontweight="medium")
        width = text.get_window_extent(renderer).width / fig.bbox.width
        x += 0.03 + width + 0.035


def date_axis(ax):
    ax.xaxis.set_major_locator(mdates.DayLocator(bymonthday=[1, 10, 20]))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%-d %b", tz=IST))


def chart_daily(data, theme, name):
    fig = plt.figure(figsize=(8.4, 4.9), dpi=200)
    frame(fig, theme)
    ax = fig.add_axes([0.085, 0.14, 0.74, 0.58])
    style_axes(ax, theme)
    ymax = 0
    for index, (zone, label, color) in enumerate(CITIES):
        daily = sorted(data[zone]["daily"].items())
        xs = [datetime(d.year, d.month, d.day, 12, tzinfo=IST) for d, _ in daily]
        ys = [v for _, v in daily]
        ymax = max(ymax, max(ys))
        ax.plot(xs, ys, color=color, linewidth=2.2, solid_capstyle="round", zorder=3)
        peak = max(range(len(ys)), key=lambda i: ys[i])
        ax.scatter([xs[peak]], [ys[peak]], s=46, color=color, edgecolor=theme["ring"], linewidth=2, zorder=4)
        ax.annotate(
            f"{label} {ys[peak]:.0f}",
            (xs[peak], ys[peak]),
            xytext=(0, 9),
            textcoords="offset points",
            ha="center",
            color=theme["text"],
            fontsize=9.5,
            fontweight="medium",
            zorder=5,
            bbox=label_box(theme),
        )
    ymax = ymax * 1.15
    ax.set_ylim(0, ymax)
    draw_bands(ax, theme, ymax, gutter=True)
    date_axis(ax)
    ax.set_xlim(START, datetime(2026, 10, 25, tzinfo=IST))
    ax.set_ylabel("PM2.5 (µg/m³)", color=theme["muted"], fontsize=10)
    titles(
        fig,
        theme,
        "Daily average PM2.5, Jammu and Srinagar",
        "10 Sep to 24 Oct 2026, with each city's worst day marked. Bands are US EPA 24-hour categories.",
    )
    legend(fig, theme, [(label, color) for _, label, color in CITIES])
    fig.savefig(os.path.join(OUT, f"{name}.png"), transparent=True)
    plt.close(fig)


def chart_hourly(data, theme, name):
    fig = plt.figure(figsize=(8.4, 6.8), dpi=200)
    frame(fig, theme)
    ymax = max(max(p for _, p, _ in data[zone]["rows"]) for zone, _, _ in CITIES) * 1.15
    for index, (zone, label, color) in enumerate(CITIES):
        ax = fig.add_axes([0.085, 0.49 - index * 0.37, 0.74, 0.28])
        style_axes(ax, theme)
        rows = data[zone]["rows"]
        xs = [w for w, _, _ in rows]
        ys = [p for _, p, _ in rows]
        ax.plot(xs, ys, color=color, linewidth=0.8, alpha=0.4, zorder=2)
        rolled = rolling_24h(rows)
        ax.plot([w for w, _ in rolled], [v for _, v in rolled], color=color, linewidth=2.2, zorder=3)
        peak = max(rows, key=lambda r: r[1])
        ax.scatter([peak[0]], [peak[1]], s=46, color=color, edgecolor=theme["ring"], linewidth=2, zorder=4)
        when = peak[0].strftime("%-d %b, %-I:%M %p").replace("AM", "am").replace("PM", "pm")
        ax.annotate(
            f"Peak {peak[1]:.0f} µg/m³, {when}",
            (peak[0], peak[1]),
            xytext=(-10, 0),
            textcoords="offset points",
            ha="right",
            va="center",
            color=theme["text"],
            fontsize=9.5,
            fontweight="medium",
            zorder=5,
            bbox=label_box(theme),
        )
        ax.set_ylim(0, ymax)
        draw_bands(ax, theme, ymax, gutter=True)
        date_axis(ax)
        ax.set_xlim(START, datetime(2026, 10, 25, 1, tzinfo=IST))
        ax.text(0.0, 1.07, label, transform=ax.transAxes, color=theme["text"], fontsize=12, fontweight="bold")
        if index == 0:
            ax.tick_params(labelbottom=False)
    titles(
        fig,
        theme,
        "Hourly PM2.5, Jammu and Srinagar",
        "Faint line: every hour. Bold line: 24-hour rolling average. µg/m³, same scale on both.",
    )
    fig.savefig(os.path.join(OUT, f"{name}.png"), transparent=True)
    plt.close(fig)


def hour_label(hour):
    if hour == 0:
        return "12 am"
    if hour == 12:
        return "12 pm"
    if hour < 12:
        return f"{hour} am"
    return f"{hour - 12} pm"


def chart_diurnal(data, theme, name):
    fig = plt.figure(figsize=(8.4, 4.7), dpi=200)
    frame(fig, theme)
    profiles = {}
    ymax = 0
    for zone, _, _ in CITIES:
        rows = data[zone]["rows"]
        sep = hourly_profile(rows, START, OCT_START)
        octo = hourly_profile(rows, OCT_START, datetime(2026, 11, 1, tzinfo=IST))
        profiles[zone] = (sep, octo)
        ymax = max(ymax, max(v for v in sep + octo if v is not None))
    ymax *= 1.2
    for index, (zone, label, color) in enumerate(CITIES):
        ax = fig.add_axes([0.085 + index * 0.385, 0.15, 0.345, 0.58])
        style_axes(ax, theme)
        sep, octo = profiles[zone]
        hours = list(range(24))
        ax.plot(hours, sep, color=color, linewidth=2, alpha=0.55, linestyle=(0, (4, 3)), zorder=3)
        ax.plot(hours, octo, color=color, linewidth=2.4, zorder=3)
        widest = max(hours, key=lambda h: octo[h] - sep[h])
        ax.annotate("October", (widest, octo[widest]), xytext=(0, 8), textcoords="offset points", ha="center", color=theme["text"], fontsize=9.5, fontweight="medium", zorder=5, bbox=label_box(theme))
        ax.annotate("September", (widest, sep[widest]), xytext=(0, -10), textcoords="offset points", ha="center", va="top", color=theme["muted"], fontsize=9.5, zorder=5, bbox=label_box(theme))
        ax.set_ylim(0, ymax)
        draw_bands(ax, theme, ymax, gutter=index == 1)
        ax.set_xlim(0, 23)
        ax.set_xticks([0, 6, 12, 18])
        ax.set_xticklabels([hour_label(h) for h in [0, 6, 12, 18]])
        ax.text(0.0, 1.05, label, transform=ax.transAxes, color=theme["text"], fontsize=12, fontweight="bold")
        if index == 1:
            ax.tick_params(labelleft=False)
    titles(
        fig,
        theme,
        "The average day, September against October",
        "Mean PM2.5 for each hour of the day (µg/m³). Dashed: 10 to 30 Sep. Solid: 1 to 24 Oct.",
    )
    fig.savefig(os.path.join(OUT, f"{name}.png"), transparent=True)
    plt.close(fig)


def chart_monthly(full, theme, name):
    fig = plt.figure(figsize=(8.4, 4.9), dpi=200)
    frame(fig, theme)
    ax = fig.add_axes([0.085, 0.14, 0.74, 0.58])
    style_axes(ax, theme)
    ax.grid(axis="y", color=theme["grid"], linewidth=0.8)
    keys = sorted(set().union(*[set(m.keys()) for m in full.values()]))
    width = 0.38
    ymax = max(max(m.values()) for m in full.values()) * 1.18
    labelled = {keys[0], (2026, 4), keys[-1]}
    for index, (zone, label, color) in enumerate(CITIES):
        offset = (index - 0.5) * width
        for position, key in enumerate(keys):
            value = full[zone].get(key)
            if value is None:
                continue
            ax.bar(position + offset, value, width=width, color=color, edgecolor=theme["bg"], linewidth=1.5, zorder=3)
            if key in labelled:
                ax.annotate(
                    f"{value:.0f}",
                    (position + offset, value),
                    xytext=(0, 4),
                    textcoords="offset points",
                    ha="center",
                    va="bottom",
                    color=theme["text"],
                    fontsize=9,
                    fontweight="medium",
                    zorder=5,
                )
    ax.set_ylim(0, ymax)
    draw_bands(ax, theme, ymax, gutter=True)
    ax.set_xlim(-0.6, len(keys) - 0.4)
    ax.set_xticks(range(len(keys)))
    ax.set_xticklabels([datetime(year, month, 1).strftime("%b") for year, month in keys])
    ax.set_ylabel("PM2.5 (µg/m³)", color=theme["muted"], fontsize=10)
    titles(
        fig,
        theme,
        "Monthly average PM2.5, January to October 2026",
        "January starts on the 18th, when our data begins. October runs to the 24th.",
    )
    legend(fig, theme, [(label, color) for _, label, color in CITIES])
    fig.savefig(os.path.join(OUT, f"{name}.png"), transparent=True)
    plt.close(fig)


def load_kanipora():
    rows = []
    with open(os.path.join(HERE, "kanipora_hourly.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append((datetime.fromtimestamp(int(row["ts"]), IST), float(row["pm2_5"])))
    rows.sort()
    return rows


def chart_kanipora(monthly, theme, name):
    fig = plt.figure(figsize=(8.4, 4.9), dpi=200)
    frame(fig, theme)
    ax = fig.add_axes([0.085, 0.16, 0.74, 0.6])
    style_axes(ax, theme)
    keys = list(monthly.keys())
    color = CITIES[1][2]
    ymax = max(monthly.values()) * 1.15
    labelled = {keys[0], (2025, 11), (2025, 12), (2026, 4), keys[-1]}
    for position, key in enumerate(keys):
        value = monthly[key]
        ax.bar(position, value, width=0.62, color=color, edgecolor=theme["bg"], linewidth=1.5, zorder=3)
        if key in labelled:
            ax.annotate(
                f"{value:.0f}",
                (position, value),
                xytext=(0, 4),
                textcoords="offset points",
                ha="center",
                va="bottom",
                color=theme["text"],
                fontsize=9,
                fontweight="medium",
                zorder=5,
            )
    ax.set_ylim(0, ymax)
    draw_bands(ax, theme, ymax, gutter=True)
    ax.set_xlim(-0.6, len(keys) - 0.4)
    ax.set_xticks(range(len(keys)))
    labels = []
    for year, month in keys:
        text = datetime(year, month, 1).strftime("%b")
        if month in (10, 1):
            text += f"\n{year}"
        labels.append(text)
    ax.set_xticklabels(labels)
    ax.set_ylabel("PM2.5 (µg/m³)", color=theme["muted"], fontsize=10)
    titles(
        fig,
        theme,
        "Kanipora, Srinagar: a year of monthly averages",
        "Our longest-running sensor, from 4 October 2025 to 24 October 2026. PM2.5 in µg/m³.",
    )
    fig.savefig(os.path.join(OUT, f"{name}.png"), transparent=True)
    plt.close(fig)


data = {}
summary = {}
for zone, label, _ in CITIES:
    rows = load(zone)
    data[zone] = {"rows": rows, "daily": daily_means(rows)}
    summary[label] = stats(rows)

print(json.dumps(summary, indent=2, default=str))
with open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, default=str)

full = {zone: monthly_means(load_full(zone)) for zone, _, _ in CITIES}
for zone, label, _ in CITIES:
    summary[label]["monthly_mean_pm25"] = {f"{y}-{m:02d}": round(v, 1) for (y, m), v in full[zone].items()}
with open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, default=str)

kanipora = monthly_means(load_kanipora())
summary["Kanipora"] = {f"{y}-{m:02d}": round(v, 1) for (y, m), v in kanipora.items()}
with open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, default=str)

for mode, theme in THEMES.items():
    chart_kanipora(kanipora, theme, f"kanipora-year-{mode}")
    chart_monthly(full, theme, f"monthly-pm25-{mode}")
    chart_daily(data, theme, f"daily-pm25-{mode}")
    chart_hourly(data, theme, f"hourly-pm25-{mode}")
    chart_diurnal(data, theme, f"daily-cycle-{mode}")


JSON_OUT = os.path.join(HERE, "..", "..", "public", "data", "winter-air-2026")
FALLBACK = "/images/posts/winter-air-2026"
COLORS = {"jammu_city": "jammu", "srinagar": "srinagar"}


def rounded(value):
    if value is None:
        return None
    return round(value, 1)


def day_label(day):
    return f"{day.day} {day.strftime('%b')}"


def hour_range_label(when):
    end = when + timedelta(hours=1)

    def clock(moment):
        text = moment.strftime("%-I:%M %p").replace("AM", "am").replace("PM", "pm")
        return text

    return f"{when.day} {when.strftime('%b')}, {clock(when)} to {clock(end)}"


def write_json(name, spec):
    os.makedirs(JSON_OUT, exist_ok=True)
    spec["fallback"] = f"{FALLBACK}/{name}-dark.png"
    with open(os.path.join(JSON_OUT, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, separators=(",", ":"))


def export_daily():
    days = []
    day = START
    while day < datetime(2026, 10, 25, tzinfo=IST):
        days.append(day.date())
        day += timedelta(days=1)
    panel = {"series": [], "marks": []}
    ymax = 0
    for zone, label, _ in CITIES:
        daily = data[zone]["daily"]
        values = [rounded(daily.get(d)) for d in days]
        ymax = max(ymax, max(v for v in values if v is not None))
        series_index = len(panel["series"])
        panel["series"].append({"name": label, "color": COLORS[zone], "style": "solid", "values": values})
        worst = max(range(len(values)), key=lambda i: values[i] if values[i] is not None else -1)
        panel["marks"].append({"series": series_index, "index": worst, "label": f"{label} {values[worst]:.0f}"})
    panel["yMax"] = round(ymax * 1.15)
    write_json(
        "daily-pm25",
        {
            "kind": "line",
            "title": "Daily average PM2.5, Jammu and Srinagar",
            "subtitle": "10 Sep to 24 Oct 2026, with each city's worst day marked.",
            "unit": "µg/m³",
            "yLabel": "PM2.5 (µg/m³)",
            "categories": True,
            "legend": [{"name": label, "color": COLORS[zone], "style": "solid"} for zone, label, _ in CITIES],
            "x": {
                "labels": [f"{day_label(d)} 2026" for d in days],
                "ticks": [[i, day_label(d)] for i, d in enumerate(days) if d.day in (1, 10, 20)],
            },
            "panels": [panel],
        },
    )


def export_hourly():
    start = START + timedelta(minutes=30)
    end = datetime(2026, 10, 25, 1, tzinfo=IST)
    hours = []
    moment = start
    while moment < end:
        hours.append(moment)
        moment += timedelta(hours=1)
    index_of = {h: i for i, h in enumerate(hours)}
    panels = []
    ymax = 0
    for zone, label, _ in CITIES:
        rows = data[zone]["rows"]
        hourly = [None] * len(hours)
        for when, pm25, _ in rows:
            if when in index_of:
                hourly[index_of[when]] = rounded(pm25)
        rolled = [None] * len(hours)
        for when, value in rolling_24h(rows):
            if when in index_of:
                rolled[index_of[when]] = rounded(value)
        ymax = max(ymax, max(v for v in hourly if v is not None))
        peak = max(range(len(hourly)), key=lambda i: hourly[i] if hourly[i] is not None else -1)
        when = hours[peak]
        clock = when.strftime("%-d %b, %-I:%M %p").replace("AM", "am").replace("PM", "pm")
        panels.append(
            {
                "title": label,
                "series": [
                    {"name": "Hourly", "color": COLORS[zone], "style": "faint", "values": hourly},
                    {"name": "24-hour average", "color": COLORS[zone], "style": "solid", "values": rolled},
                ],
                "marks": [{"series": 0, "index": peak, "label": f"Peak {hourly[peak]:.0f} µg/m³, {clock}"}],
            }
        )
    for panel in panels:
        panel["yMax"] = round(ymax * 1.15)
    first_hour = {}
    for i, h in enumerate(hours):
        first_hour.setdefault(h.date(), i)
    write_json(
        "hourly-pm25",
        {
            "kind": "line",
            "layout": "rows",
            "title": "Hourly PM2.5, Jammu and Srinagar",
            "subtitle": "Faint line: every hour. Bold line: 24-hour rolling average. Same scale on both.",
            "unit": "µg/m³",
            "yLabel": "PM2.5 (µg/m³)",
            "categories": False,
            "legend": [
                {"name": "Every hour", "color": "muted", "style": "faint"},
                {"name": "24-hour average", "color": "muted", "style": "solid"},
            ],
            "x": {
                "labels": [hour_range_label(h) for h in hours],
                "ticks": [[i, day_label(d)] for d, i in first_hour.items() if d.day in (1, 10, 20)],
            },
            "panels": panels,
        },
    )


def export_cycle():
    panels = []
    ymax = 0
    for zone, label, _ in CITIES:
        rows = data[zone]["rows"]
        sep = [rounded(v) for v in hourly_profile(rows, START, OCT_START)]
        octo = [rounded(v) for v in hourly_profile(rows, OCT_START, datetime(2026, 11, 1, tzinfo=IST))]
        ymax = max(ymax, max(v for v in sep + octo if v is not None))
        panels.append(
            {
                "title": label,
                "series": [
                    {"name": "10 to 30 Sep", "color": COLORS[zone], "style": "dashed", "values": sep},
                    {"name": "1 to 24 Oct", "color": COLORS[zone], "style": "solid", "values": octo},
                ],
                "marks": [],
            }
        )
    for panel in panels:
        panel["yMax"] = round(ymax * 1.2)

    def clock(hour):
        moment = datetime(2026, 1, 1, hour, 30)
        return moment.strftime("%-I:%M %p").replace("AM", "am").replace("PM", "pm")

    write_json(
        "daily-cycle",
        {
            "kind": "line",
            "layout": "columns",
            "title": "The average day, September against October",
            "subtitle": "Mean PM2.5 for each hour of the day.",
            "unit": "µg/m³",
            "yLabel": "PM2.5 (µg/m³)",
            "categories": False,
            "legend": [
                {"name": "10 to 30 Sep", "color": "muted", "style": "dashed"},
                {"name": "1 to 24 Oct", "color": "muted", "style": "solid"},
            ],
            "x": {
                "labels": [f"{clock(h)} to {clock((h + 1) % 24)}" for h in range(24)],
                "ticks": [[h, clock(h)] for h in (0, 6, 12, 18)],
            },
            "panels": panels,
        },
    )


def export_monthly():
    keys = sorted(set().union(*[set(m.keys()) for m in full.values()]))
    notes = {keys[0]: " (from the 18th)", keys[-1]: " (to the 24th)"}
    series = []
    for zone, label, _ in CITIES:
        series.append(
            {"name": label, "color": COLORS[zone], "style": "solid", "values": [rounded(full[zone].get(k)) for k in keys]}
        )
    ymax = max(max(m.values()) for m in full.values())
    labelled = [keys.index(k) for k in (keys[0], (2026, 4), keys[-1])]
    write_json(
        "monthly-pm25",
        {
            "kind": "bar",
            "title": "Monthly average PM2.5, January to October 2026",
            "subtitle": "January starts on the 18th, when our data begins. October runs to the 24th.",
            "unit": "µg/m³",
            "yLabel": "PM2.5 (µg/m³)",
            "categories": True,
            "legend": [{"name": label, "color": COLORS[zone], "style": "solid"} for zone, label, _ in CITIES],
            "x": {
                "labels": [datetime(y, m, 1).strftime("%B %Y") + notes.get((y, m), "") for y, m in keys],
                "ticks": [[i, datetime(y, m, 1).strftime("%b")] for i, (y, m) in enumerate(keys)],
            },
            "panels": [
                {
                    "yMax": round(ymax * 1.18),
                    "series": series,
                    "marks": [],
                    "valueLabels": [[s, i] for s in range(len(series)) for i in labelled],
                }
            ],
        },
    )


def export_kanipora():
    keys = list(kanipora.keys())
    notes = {keys[0]: " (from the 4th)", keys[-1]: " (to the 24th)"}
    ticks = []
    for i, (y, m) in enumerate(keys):
        text = datetime(y, m, 1).strftime("%b")
        if m in (10, 1):
            text += f"\n{y}"
        ticks.append([i, text])
    labelled = [keys.index(k) for k in (keys[0], (2025, 11), (2025, 12), (2026, 4), keys[-1])]
    write_json(
        "kanipora-year",
        {
            "kind": "bar",
            "title": "Kanipora, Srinagar: a year of monthly averages",
            "subtitle": "Our longest-running sensor, from 4 October 2025 to 24 October 2026.",
            "unit": "µg/m³",
            "yLabel": "PM2.5 (µg/m³)",
            "categories": True,
            "x": {
                "labels": [datetime(y, m, 1).strftime("%B %Y") + notes.get((y, m), "") for y, m in keys],
                "ticks": ticks,
            },
            "panels": [
                {
                    "yMax": round(max(kanipora.values()) * 1.15),
                    "series": [
                        {
                            "name": "Kanipora",
                            "color": "srinagar",
                            "style": "solid",
                            "values": [rounded(kanipora[k]) for k in keys],
                        }
                    ],
                    "marks": [],
                    "valueLabels": [[0, i] for i in labelled],
                }
            ],
        },
    )


export_daily()
export_hourly()
export_cycle()
export_monthly()
export_kanipora()
