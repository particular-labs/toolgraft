import { seededTasks } from "@toolgraft/test-kit";
import "./style.css";
type Task = { id: string; title: string; completed: boolean };
const key = "toolgraft-playground-v1";
let tasks: Task[];
try {
  tasks =
    JSON.parse(localStorage.getItem(key) ?? "null") ??
    structuredClone(seededTasks);
} catch {
  tasks = structuredClone(seededTasks);
}
let signedIn = true;
let sequence = tasks.reduce(
  (n, t) => Math.max(n, Number(t.id.split("-")[1]) || 0),
  0,
);
const params = new URLSearchParams(location.search);
if (params.has("empty")) tasks = [];
const list = document.querySelector<HTMLUListElement>("#tasks")!;
const form = document.querySelector<HTMLFormElement>("#create")!;
const input = document.querySelector<HTMLInputElement>("#title")!;
const msg = document.querySelector<HTMLElement>("#message")!;
function render() {
  document.documentElement.dataset.session = signedIn
    ? "signed-in"
    : "signed-out";
  list.replaceChildren();
  for (const task of tasks) {
    const li = document.createElement("li");
    li.dataset.taskId = task.id;
    li.dataset.completed = String(task.completed);
    const label = document.createElement("span");
    label.dataset.title = "";
    label.textContent = task.title;
    const button = document.createElement("button");
    button.textContent = task.completed ? "Completed" : "Complete";
    button.disabled = task.completed || !signedIn;
    button.dataset.complete = task.id;
    button.onclick = () => {
      task.completed = true;
      save();
    };
    li.append(label, button);
    list.append(li);
  }
  if (!tasks.length) {
    const empty = document.createElement("li");
    empty.textContent = "No tasks yet. Create one to get started.";
    list.append(empty);
  }
  if (params.get("shape") !== "broken") list.dataset.toolgraftTasks = "v1";
  else delete list.dataset.toolgraftTasks;
  form.hidden = !signedIn;
  document.querySelector("#session")!.textContent = signedIn
    ? "Sign out of demo"
    : "Sign in to demo";
}
function save() {
  localStorage.setItem(key, JSON.stringify(tasks));
  render();
}
form.onsubmit = (e) => {
  e.preventDefault();
  if (!signedIn) return;
  const title = input.value.trim();
  if (!title) return;
  tasks.push({ id: `task-${++sequence}`, title, completed: false });
  input.value = "";
  save();
  msg.textContent = "Task created.";
};
document.querySelector<HTMLButtonElement>("#session")!.onclick = () => {
  signedIn = !signedIn;
  render();
};
document.querySelector<HTMLButtonElement>("#reset")!.onclick = () => {
  tasks = structuredClone(seededTasks);
  sequence = 3;
  save();
  msg.textContent = "Demo data reset.";
};
function route() {
  const taskRoute = location.pathname === "/" || location.pathname === "/tasks";
  document.querySelector<HTMLElement>("#tasks-view")!.hidden = !taskRoute;
  document.querySelector<HTMLElement>("#about-view")!.hidden = taskRoute;
}
for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-route]"))
  a.onclick = (e) => {
    e.preventDefault();
    history.pushState({}, "", a.pathname);
    route();
  };
addEventListener("popstate", route);
route();
setTimeout(render, Math.min(Number(params.get("delay") ?? 0), 5000));
