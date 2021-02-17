import React, { Component } from "react";
import axios from "axios";
import { Spin } from "antd";
import { feature } from "topojson-client";
import { geoKavrayskiy7 } from "d3-geo-projection";
import { geoGraticule, geoPath } from "d3-geo";
import { select as d3Select } from "d3-selection";
import { schemeCategory10 } from "d3-scale-chromatic";
import * as d3Scale from "d3-scale";
import { timeFormat as d3TimeFormat } from "d3-time-format";

import {
    WORLD_MAP_URL,
    SATELLITE_POSITION_URL,
    SAT_API_KEY
} from "../constants";



const width = 960;
const height = 600;

class WorldMap extends Component {
    constructor(){
        super();
        this.state = {
            isLoading: false,
            isDrawing: false
        };
        this.map = null;
        this.color = d3Scale.scaleOrdinal(schemeCategory10);
        this.refMap = React.createRef();
        this.refTrack = React.createRef();

    }
    //获取数据
    componentDidMount() {
        axios
            .get(WORLD_MAP_URL)
            //拿到map数据
            .then(res => {
                const { data } = res;
                const land = feature(data, data.objects.countries).features;
                this.generateMap(land);
            })
            .catch(e => console.log('err in fecth world map data ', e))
    }
    componentDidUpdate(prevProps, prevState, snapshot) {
        if (prevProps.satData !== this.props.satData) {
            //step1: get setting and select satlist
            const {
                latitude,
                longitude,
                elevation,
                altitude,
                duration
            } = this.props.observerData;
            const endTime = duration * 60;

            this.setState({
                isLoading: true
            });

            //step2: prepare for the url
            const urls = this.props.satData.map(sat => {
                const { satid } = sat;
                const url = `/api/${SATELLITE_POSITION_URL}/${satid}/${latitude}/${longitude}/${elevation}/${endTime}/&apiKey=${SAT_API_KEY}`;
                //按照axios手册来的
                return axios.get(url);
            });
            //step3: parse sat position data
            //url 实际上是一堆promise，所以对promise的结果进行处理
            Promise.all(urls)
                .then(res => {
                    //拿到返回的data
                    const arr = res.map(sat => sat.data);

                    //step4: track
                    this.setState({
                        isLoading: false,
                        isDrawing: true
                    });

                    if (!prevState.isDrawing) {
                        this.track(arr);
                    } else {
                        const oHint = document.getElementsByClassName("hint")[0];
                        oHint.innerHTML =
                            "Please wait for these satellite animation to finish before selection new ones!";
                    }
                })
                .catch(e => {
                    console.log("err in fetch satellite position -> ", e.message);
                });
        }
    }
    //step 4: 找track
    track = data => {
        //没有数据，就return
        if (!data[0].hasOwnProperty("positions")) {
            throw new Error("no position data");
            return;
        }
        //拿到 total number of position
        const len = data[0].positions.length;
        //duration
        const { duration } = this.props.observerData;
        //where to draw
        const { context2 } = this.map;
        //创建当前作图时间
        let now = new Date();
        //统计画了多少条数据
        let i = 0;
        //set interval: 每1000us打个点
        let timer = setInterval(() => {
            //当前时间
            let ct = new Date();
            //判断时间流逝
            let timePassed = i === 0 ? 0 : ct - now;
            //计算当前时间
            let time = new Date(now.getTime() + 60 * timePassed);
            //开始作图： draw track
            //清楚上一个点
            context2.clearRect(0, 0, width, height);

            context2.font = "bold 14px sans-serif";
            context2.fillStyle = "#333";
            context2.textAlign = "center";
            context2.fillText(d3TimeFormat(time), width / 2, 10);

            if (i >= len) {
                clearInterval(timer);
                this.setState({ isDrawing: false });
                //提示不能同时画两个图
                const oHint = document.getElementsByClassName("hint")[0];
                oHint.innerHTML = "";
                return;
            }

            data.forEach(sat => {
                const { info, positions } = sat;
                this.drawSat(info, positions[i]);
            });

            i += 60;
        }, 1000);
    };

    drawSat = (sat, pos) => {
        const { satlongitude, satlatitude } = pos;

        if (!satlongitude || !satlatitude) return;

        const { satname } = sat;
        const nameWithNumber = satname.match(/\d+/g).join("");

        const { projection, context2 } = this.map;
        const xy = projection([satlongitude, satlatitude]);

        context2.fillStyle = this.color(nameWithNumber);
        context2.beginPath();
        context2.arc(xy[0], xy[1], 4, 0, 2 * Math.PI);
        context2.fill();

        context2.font = "bold 11px sans-serif";
        context2.textAlign = "center";
        context2.fillText(nameWithNumber, xy[0], xy[1] + 14);
    };

    render() {
        const { isLoading } = this.state;
        return (
            <div className="map-box">
                {isLoading ? (
                    <div className="spinner">
                        <Spin tip="Loading..." size="large" />
                    </div>
                ) : null}
                <canvas className="map" ref={this.refMap} />
                <canvas className="track" ref={this.refTrack} />
                <div className="hint" />
            </div>
        );
    }

    generateMap = land => {
        //创建一个投影仪，并指定一个形状
        const projection = geoKavrayskiy7()
            .scale(170)
            .translate([width / 2, height / 2])
            .precision(.1);

        const graticule = geoGraticule();

        const canvas = d3Select(this.refMap.current)
            .attr("width", width)
            .attr("height", height);
        const canvas2 = d3Select(this.refTrack.current)
            .attr("width", width)
            .attr("height", height);


        const context = canvas.node().getContext("2d");
        const context2 = canvas2.node().getContext("2d");


        let path = geoPath()
            .projection(projection)
            .context(context);

        land.forEach(ele => {
            context.fillStyle = '#B3DDEF';  //填充色
            context.strokeStyle = '#000';   //边界颜色
            context.globalAlpha = 0.7;      //地图颜色饱和度
            context.beginPath();
            path(ele);
            context.fill();
            context.stroke();

            context.strokeStyle = 'rgba(220, 220, 220, 0.1)';  //定义经纬度的线条颜色
            context.beginPath();
            path(graticule());    //画经纬度
            context.lineWidth = 0.1;  //线条宽度
            context.stroke();     //做线条

            //画地图的上下边界两条线
            context.beginPath();
            context.lineWidth = 0.5;
            path(graticule.outline());
            context.stroke();
        })


    this.map = {
        projection: projection,
        graticule: graticule,
        context: context,
        context2: context2
    };
};
}


export default WorldMap;

