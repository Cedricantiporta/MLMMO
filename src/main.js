import './style.css';
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.start();
window.__game = game;
