function formatDate(date) {

    const now = new Date();
    const created = new Date(date);

    const difference =
        Math.floor((now - created) / 1000);

    if (difference < 60) {
        return "Just now";
    }

    const minutes =
        Math.floor(difference / 60);

    if (minutes < 60) {
        return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }

    const hours =
        Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    const days =
        Math.floor(hours / 24);

    if (days === 1) {
        return "Yesterday";
    }

    if (days < 7) {
        return `${days} days ago`;
    }

    return created.toLocaleString(
        "en-GB",
        {
            timeZone: "Europe/London",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );

}

module.exports = formatDate;