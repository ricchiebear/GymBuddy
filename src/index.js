const app = require("./app");
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

const io = new Server(server);

io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("joinWorkoutChat", (workoutId) => {
        socket.join(`workout-${workoutId}`);
    });

    socket.on("sendWorkoutMessage", (data) => {
        io.to(`workout-${data.workoutId}`).emit("receiveWorkoutMessage", data);
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

app.listen(3000, () => {
    console.log("Gymbuddy is running on http://localhost:3000");
});